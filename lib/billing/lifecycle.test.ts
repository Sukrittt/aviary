import { describe, it, expect, vi, beforeEach } from 'vitest'

const purgeAccountNow = vi.fn(async () => ({ rows: 0, blobs: 0 }))
const refreshFromProvider = vi.fn()
const getAccess = vi.fn()
const sendPushNotification = vi.fn(async () => {})
const settings = { billing: { retentionDeleteEnabled: false } }

vi.mock('../accountLifecycle', () => ({ purgeAccountNow: (...a: unknown[]) => purgeAccountNow(...(a as [])) }))
vi.mock('./service', () => ({
  getAccess: (...a: unknown[]) => getAccess(...a),
  refreshFromProvider: (...a: unknown[]) => refreshFromProvider(...a),
}))
vi.mock('../push', () => ({ sendPushNotification: (...a: unknown[]) => sendPushNotification(...(a as [])) }))
vi.mock('../systemSettings', () => ({ getSystemSettings: async () => settings }))
// A claim succeeds the first time a key is seen, like the unique index in notification_log.
const claimed = new Set<string>()
vi.mock('../notifications/deliver', () => ({
  claim: async (_db: unknown, userId: string, key: string) => (claimed.has(`${userId}:${key}`) ? false : (claimed.add(`${userId}:${key}`), true)),
  unclaim: async (_db: unknown, userId: string, key: string) => void claimed.delete(`${userId}:${key}`),
}))

const { noticeTier, addMonthsUtc, accessEndedAt, runRetention, sendTrialReminders } = await import('./lifecycle')

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-01T05:00:00.000Z')

describe('noticeTier', () => {
  const trial = [7, 3, 1] as const
  it('is null before the first threshold and after the moment has passed', () => {
    expect(noticeTier(8 * DAY, trial)).toBeNull()
    expect(noticeTier(0, trial)).toBeNull()
    expect(noticeTier(-DAY, trial)).toBeNull()
  })
  it('picks the smallest threshold crossed, boundaries inclusive', () => {
    expect(noticeTier(7 * DAY, trial)).toBe(7)
    expect(noticeTier(6.5 * DAY, trial)).toBe(7)
    expect(noticeTier(3 * DAY, trial)).toBe(3)
    expect(noticeTier(2 * DAY, trial)).toBe(3)
    expect(noticeTier(DAY, trial)).toBe(1)
    expect(noticeTier(1, trial)).toBe(1)
  })
})

describe('addMonthsUtc', () => {
  it('adds twelve months', () => {
    expect(addMonthsUtc(new Date('2026-03-15T10:00:00Z'), 12).toISOString()).toBe('2027-03-15T10:00:00.000Z')
  })
  it('clamps to month end instead of overflowing into the next month', () => {
    expect(addMonthsUtc(new Date('2027-01-31T00:00:00Z'), 1).toISOString()).toBe('2027-02-28T00:00:00.000Z')
    expect(addMonthsUtc(new Date('2027-02-28T00:00:00Z'), 12).toISOString()).toBe('2028-02-28T00:00:00.000Z')
    expect(addMonthsUtc(new Date('2028-02-29T00:00:00Z'), 12).toISOString()).toBe('2029-02-28T00:00:00.000Z')
  })
})

describe('accessEndedAt', () => {
  const trialEndsAt = new Date('2026-06-01T00:00:00Z')
  it('is the trial end when there was never a purchase', () => {
    expect(accessEndedAt({ trialEndsAt }, [])).toEqual(trialEndsAt)
  })
  it('is the latest paid-through date when a purchase outlasted the trial', () => {
    const later = new Date('2026-09-01T00:00:00Z')
    expect(accessEndedAt({ trialEndsAt }, [{ expiresAt: new Date('2026-08-01T00:00:00Z') }, { expiresAt: later }, { expiresAt: null }])).toEqual(later)
  })
  it('ignores a purchase that ended before the trial did', () => {
    expect(accessEndedAt({ trialEndsAt }, [{ expiresAt: new Date('2026-01-01T00:00:00Z') }])).toEqual(trialEndsAt)
  })
})

/** Minimal Mongo: each collection is an array, queried by the handful of operators the jobs use. */
function fakeDb(seed: Record<string, Record<string, unknown>[]>) {
  const store = structuredClone(seed)
  const test = (v: unknown, cond: unknown): boolean => {
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, Date>
      return Object.entries(c).every(([op, x]) =>
        op === '$lte' ? v != null && (v as Date) <= x : op === '$gt' ? v != null && (v as Date) > x : true,
      )
    }
    return cond === null ? v == null : v === cond
  }
  const matches = (d: Record<string, unknown>, f: Record<string, unknown>) => Object.entries(f).every(([k, c]) => test(d[k], c))
  return {
    store,
    db: {
      collection: (name: string) => {
        store[name] ??= []
        return {
          find: (f: Record<string, unknown>) => ({ limit: () => ({ toArray: async () => store[name].filter((d) => matches(d, f)) }), toArray: async () => store[name].filter((d) => matches(d, f)) }),
          findOne: async (f: Record<string, unknown>) => store[name].find((d) => matches(d, f)) ?? null,
          countDocuments: async (f: Record<string, unknown>) => store[name].filter((d) => matches(d, f)).length,
          updateOne: async (f: Record<string, unknown>, u: { $set: Record<string, unknown> }) => {
            const d = store[name].find((x) => matches(x, f))
            if (d) Object.assign(d, u.$set)
            return { modifiedCount: d ? 1 : 0 }
          },
        }
      },
    } as never,
  }
}

const expiredAccount = (over: Record<string, unknown> = {}) => ({
  _id: 'user_a',
  trialStartedAt: new Date('2025-01-01T00:00:00Z'),
  trialEndsAt: new Date('2025-02-15T00:00:00Z'),
  retentionDeadline: null,
  ...over,
})

describe('runRetention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    claimed.clear()
    settings.billing.retentionDeleteEnabled = false
    getAccess.mockResolvedValue({ enforced: true, mode: 'expired' })
  })

  it('sets the deadline twelve months after access last ended', async () => {
    const { db, store } = fakeDb({ billing_accounts: [expiredAccount()], billing_subscriptions: [], users: [{ _id: 'user_a' }] })
    const res = await runRetention(db, NOW)
    expect(res.deadlinesSet).toBe(1)
    expect((store.billing_accounts[0].retentionDeadline as Date).toISOString()).toBe('2026-02-15T00:00:00.000Z')
  })

  it('does not set a deadline while enforcement is off, or for someone still entitled', async () => {
    const off = fakeDb({ billing_accounts: [expiredAccount()], billing_subscriptions: [], users: [{ _id: 'user_a' }] })
    getAccess.mockResolvedValueOnce({ enforced: false, mode: 'expired' })
    expect((await runRetention(off.db, NOW)).deadlinesSet).toBe(0)

    const paid = fakeDb({ billing_accounts: [expiredAccount()], billing_subscriptions: [], users: [{ _id: 'user_a' }] })
    getAccess.mockResolvedValueOnce({ enforced: true, mode: 'paid' })
    expect((await runRetention(paid.db, NOW)).deadlinesSet).toBe(0)
  })

  it('reports what it would delete but deletes nothing while the flag is off', async () => {
    const { db } = fakeDb({ billing_accounts: [expiredAccount({ retentionDeadline: new Date('2026-09-01T00:00:00Z') })], billing_subscriptions: [], users: [{ _id: 'user_a' }] })
    const res = await runRetention(db, NOW)
    expect(res).toMatchObject({ due: 1, deleted: 0 })
    expect(purgeAccountNow).not.toHaveBeenCalled()
    expect(refreshFromProvider).not.toHaveBeenCalled()
  })

  it('deletes only after a fresh provider check still says expired', async () => {
    settings.billing.retentionDeleteEnabled = true
    refreshFromProvider.mockResolvedValue({ enforced: true, mode: 'expired' })
    const { db } = fakeDb({ billing_accounts: [expiredAccount({ retentionDeadline: new Date('2026-09-01T00:00:00Z') })], billing_subscriptions: [], users: [{ _id: 'user_a' }] })
    expect(await runRetention(db, NOW)).toMatchObject({ due: 1, deleted: 1 })
    expect(refreshFromProvider).toHaveBeenCalledWith('user_a', NOW)
    expect(purgeAccountNow).toHaveBeenCalledTimes(1)
  })

  it('never deletes when the provider is unreachable', async () => {
    settings.billing.retentionDeleteEnabled = true
    refreshFromProvider.mockRejectedValue(new Error('RevenueCat responded 500'))
    const { db } = fakeDb({ billing_accounts: [expiredAccount({ retentionDeadline: new Date('2026-09-01T00:00:00Z') })], billing_subscriptions: [], users: [{ _id: 'user_a' }] })
    expect(await runRetention(db, NOW)).toMatchObject({ deleted: 0, skipped: 1 })
    expect(purgeAccountNow).not.toHaveBeenCalled()
  })

  it('does not delete someone who renewed just before the deadline', async () => {
    settings.billing.retentionDeleteEnabled = true
    refreshFromProvider.mockResolvedValue({ enforced: true, mode: 'paid' })
    const { db } = fakeDb({ billing_accounts: [expiredAccount({ retentionDeadline: new Date('2026-09-01T00:00:00Z') })], billing_subscriptions: [], users: [{ _id: 'user_a' }] })
    expect(await runRetention(db, NOW)).toMatchObject({ deleted: 0 })
    expect(purgeAccountNow).not.toHaveBeenCalled()
  })

  it('sends each deletion notice once', async () => {
    const soon = new Date(NOW.getTime() + 6 * DAY)
    const seed = { billing_accounts: [expiredAccount({ retentionDeadline: soon })], billing_subscriptions: [], users: [{ _id: 'user_a' }] }
    const { db } = fakeDb(seed)
    expect((await runRetention(db, NOW)).noticesSent).toBe(1)
    expect((await runRetention(db, new Date(NOW.getTime() + DAY))).noticesSent).toBe(0)
    expect(sendPushNotification).toHaveBeenCalledTimes(1)
  })
})

describe('sendTrialReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    claimed.clear()
  })
  const trialEnding = (days: number) => ({ _id: 'user_a', trialEndsAt: new Date(NOW.getTime() + days * DAY) })

  it('reminds a trialing user once per tier', async () => {
    getAccess.mockResolvedValue({ enforced: true, mode: 'trial' })
    const { db } = fakeDb({ billing_accounts: [trialEnding(6.5)], users: [{ _id: 'user_a' }] })
    expect((await sendTrialReminders(db, NOW)).sent).toBe(1)
    expect((await sendTrialReminders(db, new Date(NOW.getTime() + DAY))).sent).toBe(0)
  })

  it('gives each day its own job: the month so far, what pauses, then one tap', async () => {
    getAccess.mockResolvedValue({ enforced: true, mode: 'trial' })
    const expenses = [{ user_id: 'user_a', deleted_at: null }, { user_id: 'user_a', deleted_at: null }, { user_id: 'user_a', deleted_at: new Date() }, { user_id: 'user_b', deleted_at: null }]
    const sent = async (days: number) => {
      sendPushNotification.mockClear()
      const { db } = fakeDb({ billing_accounts: [trialEnding(days)], users: [{ _id: 'user_a' }], expenses })
      await sendTrialReminders(db, NOW)
      return (sendPushNotification.mock.calls[0] as unknown as [{ title: string; body: string }])[0]
    }
    expect(await sent(6.5)).toMatchObject({ title: 'Your 30 days on us end in 7 days', body: expect.stringContaining("You've logged 2 expenses so far") })
    expect(await sent(2.5)).toMatchObject({ title: 'Your 30 days on us end in 3 days', body: expect.stringContaining('Your 2 expenses stay safe') })
    expect(await sent(0.5)).toMatchObject({ title: 'Your 30 days on us end tomorrow', body: 'Tomorrow you can keep Aviary in one tap. Your data stays safe either way.' })
  })

  it('stays quiet for a subscriber, and while enforcement is off', async () => {
    const { db } = fakeDb({ billing_accounts: [trialEnding(2)], users: [{ _id: 'user_a' }] })
    getAccess.mockResolvedValueOnce({ enforced: true, mode: 'paid' })
    expect((await sendTrialReminders(db, NOW)).sent).toBe(0)
    getAccess.mockResolvedValueOnce({ enforced: false, mode: 'trial' })
    expect((await sendTrialReminders(db, NOW)).sent).toBe(0)
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('lets tomorrow retry a push that failed, rather than burning the notice', async () => {
    getAccess.mockResolvedValue({ enforced: true, mode: 'trial' })
    sendPushNotification.mockRejectedValueOnce(new Error('expo down'))
    const { db } = fakeDb({ billing_accounts: [trialEnding(2)], users: [{ _id: 'user_a' }] })
    expect((await sendTrialReminders(db, NOW)).sent).toBe(0)
    expect((await sendTrialReminders(db, NOW)).sent).toBe(1)
  })
})
