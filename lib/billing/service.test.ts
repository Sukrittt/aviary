import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Db } from 'mongodb'

vi.mock('../mongodb', () => ({ getDb: vi.fn() }))
vi.mock('./flags', () => ({ billingFlagsFor: vi.fn(async () => ({ enforced: true, purchaseEnabled: false })) }))

const { completeOnboarding, startTrial, hasCompletedSetup } = await import('./service')
const { TRIAL_DAYS } = await import('./records')

const NOW = new Date('2026-09-18T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

/**
 * Just enough Mongo to exercise the write ordering and the `$setOnInsert`
 * idempotency this module leans on. Not a Mongo emulator — the unique-`_id`
 * behaviour under concurrency is the database's job and is asserted against
 * a real index in scripts/ensure-indexes.mjs.
 */
function fakeDb(seed: Record<string, Record<string, unknown>[]> = {}) {
  const store: Record<string, Record<string, unknown>[]> = { budgets: [], categories: [], users: [], billing_accounts: [], ...seed }
  const matches = (doc: Record<string, unknown>, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([k, v]) => {
      if (v && typeof v === 'object' && '$in' in (v as object)) return ((v as { $in: unknown[] }).$in).includes(doc[k])
      return doc[k] === v
    })
  const db = {
    collection: (name: string) => {
      store[name] ??= []
      const rows = () => store[name]
      return {
        findOne: async (filter: Record<string, unknown>) => rows().find((d) => matches(d, filter)) ?? null,
        find: (filter: Record<string, unknown>) => ({ toArray: async () => rows().filter((d) => matches(d, filter)) }),
        updateOne: async (filter: Record<string, unknown>, update: Record<string, Record<string, unknown>>) => {
          const found = rows().find((d) => matches(d, filter))
          if (found) Object.assign(found, update.$set ?? {})
        },
        findOneAndUpdate: async (filter: Record<string, unknown>, update: Record<string, Record<string, unknown>>) => {
          const found = rows().find((d) => matches(d, filter))
          if (found) return found
          const created = { ...(update.$setOnInsert ?? {}) }
          rows().push(created)
          return created
        },
      }
    },
  }
  return { db: db as unknown as Db, store }
}

const setupDone = {
  budgets: [{ _id: 'b1', user_id: 'user_a', deleted_at: null, category: '__income__' }],
  categories: [{ _id: 'c1', user_id: 'user_a', deleted_at: null, name: '🍔 Food' }],
  users: [{ _id: 'user_a', onboardedAt: null }],
}

beforeEach(() => vi.clearAllMocks())

describe('hasCompletedSetup', () => {
  it('is false with no persisted setup', async () => {
    expect(await hasCompletedSetup(fakeDb().db, 'user_a')).toBe(false)
  })

  it('is false with categories but no income budget row', async () => {
    const { db } = fakeDb({ categories: setupDone.categories })
    expect(await hasCompletedSetup(db, 'user_a')).toBe(false)
  })

  it('ignores another user’s setup', async () => {
    const { db } = fakeDb({
      budgets: [{ _id: 'b1', user_id: 'user_b', deleted_at: null, category: '__income__' }],
      categories: [{ _id: 'c1', user_id: 'user_b', deleted_at: null }],
    })
    expect(await hasCompletedSetup(db, 'user_a')).toBe(false)
  })

  it('is true once both exist', async () => {
    const { db } = fakeDb(setupDone)
    expect(await hasCompletedSetup(db, 'user_a')).toBe(true)
  })
})

describe('startTrial', () => {
  it('grants exactly 45 × 24h from the server instant', async () => {
    const { db } = fakeDb()
    const account = await startTrial(db, 'user_a', 'onboarding-v1', NOW)
    expect(account.trialStartedAt).toEqual(NOW)
    expect(account.trialEndsAt.getTime() - NOW.getTime()).toBe(TRIAL_DAYS * DAY)
  })

  it('never restarts an existing clock, whatever instant is passed', async () => {
    const { db, store } = fakeDb()
    const first = await startTrial(db, 'user_a', 'onboarding-v1', NOW)
    const again = await startTrial(db, 'user_a', 'legacy-launch-v1', new Date(NOW.getTime() + 100 * DAY))
    expect(again.trialEndsAt).toEqual(first.trialEndsAt)
    expect(again.trialCohort).toBe('onboarding-v1')
    expect(store.billing_accounts).toHaveLength(1)
  })
})

describe('completeOnboarding', () => {
  it('refuses to mint a trial when no setup was persisted', async () => {
    const { db, store } = fakeDb({ users: [{ _id: 'user_a', onboardedAt: null }] })
    expect(await completeOnboarding(db, 'user_a', NOW)).toEqual({ ok: false, reason: 'setup_incomplete' })
    expect(store.billing_accounts).toHaveLength(0)
  })

  it('starts the trial and stamps the server instant', async () => {
    const { db, store } = fakeDb(structuredClone(setupDone))
    const result = await completeOnboarding(db, 'user_a', NOW)
    expect(result).toMatchObject({ ok: true, onboardedAt: NOW.toISOString() })
    expect(store.users[0].onboardedAt).toBe(NOW.toISOString())
    expect(store.users[0].getStartedAt).toBe(NOW.toISOString())
    expect(store.billing_accounts).toHaveLength(1)
  })

  /**
   * The path every app version already on Play uses. Those installs cannot be
   * fixed by redeploying the API, so a heuristic disagreeing with them must
   * never strand a user on the setup screen retrying a doomed request.
   */
  it('still completes for a legacy client when the setup check disagrees', async () => {
    const { db, store } = fakeDb({ users: [{ _id: 'user_a', onboardedAt: null }] })
    const result = await completeOnboarding(db, 'user_a', NOW, { requireSetup: false })
    expect(result).toMatchObject({ ok: true, onboardedAt: NOW.toISOString() })
    expect(store.billing_accounts).toHaveLength(1)
  })

  it('stays strict by default, so a new client can retry after its writes land', async () => {
    const { db } = fakeDb({ users: [{ _id: 'user_a', onboardedAt: null }] })
    expect(await completeOnboarding(db, 'user_a', NOW)).toEqual({ ok: false, reason: 'setup_incomplete' })
  })

  it('is idempotent — a replay moves neither date', async () => {
    const { db, store } = fakeDb(structuredClone(setupDone))
    const first = await completeOnboarding(db, 'user_a', NOW)
    const replay = await completeOnboarding(db, 'user_a', new Date(NOW.getTime() + 30 * DAY))
    expect(replay).toEqual(first)
    expect(store.billing_accounts).toHaveLength(1)
  })
})
