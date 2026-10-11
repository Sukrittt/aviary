import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RzpSubscription } from './razorpay'

type Row = Record<string, unknown>
const store: Record<string, Row[]> = {}

/** Just enough Mongo for the projection writer: equality, `$lt`, `$in`, `$ne`, and upsert via `$setOnInsert`. */
function matches(doc: Row, filter: Row): boolean {
  return Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const op = v as Record<string, unknown>
      if ('$lt' in op) return (doc[k] as Date).getTime() < (op.$lt as Date).getTime()
      if ('$in' in op) return (op.$in as unknown[]).includes(doc[k])
      if ('$ne' in op) return doc[k] !== op.$ne
    }
    return doc[k] === v
  })
}

const fakeDb = {
  collection: (name: string) => {
    store[name] ??= []
    const rows = () => store[name]
    return {
      findOne: async (filter: Row) => rows().find((d) => matches(d, filter)) ?? null,
      find: (filter: Row) => ({ toArray: async () => rows().filter((d) => matches(d, filter)) }),
      updateOne: async (filter: Row, update: { $set?: Row; $setOnInsert?: Row }, opts?: { upsert?: boolean }) => {
        const found = rows().find((d) => matches(d, filter))
        if (found) Object.assign(found, update.$set ?? {})
        else if (opts?.upsert) rows().push({ _id: `row_${rows().length}`, ...(update.$setOnInsert ?? {}), ...(update.$set ?? {}) })
      },
    }
  },
}

vi.mock('../mongodb', () => ({ getDb: vi.fn(async () => fakeDb) }))
vi.mock('./flags', () => ({ billingFlagsFor: vi.fn(async () => ({ enforced: true, purchaseEnabled: true })) }))

const fetchSubscriberMock = vi.fn()
vi.mock('./revenuecat', async (orig) => ({ ...(await orig<typeof import('./revenuecat')>()), fetchSubscriber: (id: string) => fetchSubscriberMock(id) }))

const fetchSubscriptionMock = vi.fn()
const cancelSubscriptionMock = vi.fn()
vi.mock('./razorpay', async (orig) => ({
  ...(await orig<typeof import('./razorpay')>()),
  razorpayConfig: () => ({ keyId: 'rzp_live_abc', keySecret: 'secret', plans: { monthly: 'plan_month', yearly: 'plan_year' } }),
  fetchSubscription: (id: string) => fetchSubscriptionMock(id),
  cancelSubscription: (id: string, atCycleEnd: boolean) => cancelSubscriptionMock(id, atCycleEnd),
}))

const { recordRazorpaySubscription, refreshFromProvider, cancelWebSubscriptions, SubscriptionOwnerError } = await import('./service')
const { RevenueCatError } = await import('./revenuecat')

const NOW = new Date('2026-09-18T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const secs = (offsetDays: number) => Math.floor((NOW.getTime() + offsetDays * DAY) / 1000)

function sub(over: Partial<RzpSubscription> = {}): RzpSubscription {
  return {
    id: 'sub_1',
    plan_id: 'plan_year',
    status: 'active',
    current_start: secs(-10),
    current_end: secs(355),
    ended_at: null,
    paid_count: 1,
    notes: { userId: 'user_a' },
    ...over,
  }
}

const account = { _id: 'user_a', trialStartedAt: new Date(NOW.getTime() - 60 * DAY), trialEndsAt: new Date(NOW.getTime() - 15 * DAY), trialCohort: 'onboarding-v1', createdAt: NOW }
const subs = () => store.billing_subscriptions ?? []

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(store)) delete store[k]
  store.billing_accounts = [{ ...account }]
  fetchSubscriberMock.mockResolvedValue(null)
  fetchSubscriptionMock.mockResolvedValue(sub())
  cancelSubscriptionMock.mockResolvedValue(sub())
})

describe('recordRazorpaySubscription', () => {
  it('writes a verified web purchase and unlocks an expired account', async () => {
    const access = await recordRazorpaySubscription('user_a', 'sub_1', NOW)
    expect(access).toMatchObject({ mode: 'paid', allowed: true, store: 'web', basePlanId: 'yearly', autoRenew: true })
    expect(subs()).toHaveLength(1)
    expect(subs()[0]).toMatchObject({ userId: 'user_a', provider: 'razorpay', environment: 'production', storeTransactionId: 'sub_1' })
  })

  it("refuses someone else's subscription and writes nothing", async () => {
    fetchSubscriptionMock.mockResolvedValue(sub({ notes: { userId: 'user_b' } }))
    await expect(recordRazorpaySubscription('user_a', 'sub_1', NOW)).rejects.toBeInstanceOf(SubscriptionOwnerError)
    expect(subs()).toHaveLength(0)
  })

  it('is idempotent: a second verify for the same subscription updates the one row', async () => {
    await recordRazorpaySubscription('user_a', 'sub_1', NOW)
    await recordRazorpaySubscription('user_a', 'sub_1', new Date(NOW.getTime() + 1000))
    expect(subs()).toHaveLength(1)
  })

  it('never lets an older read overwrite a newer one', async () => {
    await recordRazorpaySubscription('user_a', 'sub_1', NOW)
    fetchSubscriptionMock.mockResolvedValue(sub({ status: 'halted', current_end: secs(-3) }))
    await recordRazorpaySubscription('user_a', 'sub_1', new Date(NOW.getTime() - 1000))
    expect(subs()[0].status).toBe('active')
  })
})

describe('refreshFromProvider', () => {
  it('re-reads the web subscriptions already on record', async () => {
    await recordRazorpaySubscription('user_a', 'sub_1', NOW)
    fetchSubscriptionMock.mockResolvedValue(sub({ status: 'halted', current_end: secs(-3) }))
    const access = await refreshFromProvider('user_a', new Date(NOW.getTime() + 1000))
    expect(access).toMatchObject({ mode: 'expired', renewalState: 'on_hold', store: 'web' })
  })

  it('still records the web renewal when RevenueCat is down, then reports the outage', async () => {
    await recordRazorpaySubscription('user_a', 'sub_1', NOW)
    fetchSubscriberMock.mockRejectedValue(new RevenueCatError('RevenueCat responded 500', 500))
    fetchSubscriptionMock.mockResolvedValue(sub({ current_end: secs(700) }))
    await expect(refreshFromProvider('user_a', new Date(NOW.getTime() + 1000))).rejects.toBeInstanceOf(RevenueCatError)
    expect(subs()[0].expiresAt).toEqual(new Date(secs(700) * 1000))
  })

  it("doesn't call Razorpay for a user with no web purchase", async () => {
    await refreshFromProvider('user_a', NOW)
    expect(fetchSubscriptionMock).not.toHaveBeenCalled()
  })
})

describe('cancelWebSubscriptions', () => {
  it('cancels a renewing web plan at cycle end and keeps the paid access', async () => {
    await recordRazorpaySubscription('user_a', 'sub_1', NOW)
    const later = new Date(NOW.getTime() + 1000)
    expect(await cancelWebSubscriptions('user_a', later)).toBe(1)
    expect(cancelSubscriptionMock).toHaveBeenCalledWith('sub_1', true)
    expect(subs()[0]).toMatchObject({ cancelAtPeriodEnd: true, status: 'cancelled', autoRenew: false })
    // Razorpay still says `active` until the cycle ends; our flag is what keeps it from reading as renewing.
    const access = await refreshFromProvider('user_a', new Date(NOW.getTime() + 2000))
    expect(access).toMatchObject({ mode: 'paid', autoRenew: false, renewalState: 'cancelled' })
  })

  it('leaves the row saying it renews when Razorpay refuses the cancel', async () => {
    await recordRazorpaySubscription('user_a', 'sub_1', NOW)
    cancelSubscriptionMock.mockRejectedValue(new Error('Razorpay responded 502'))
    await expect(cancelWebSubscriptions('user_a', NOW)).rejects.toThrow('502')
    expect(subs()[0].cancelAtPeriodEnd).toBeUndefined()
  })

  it('does nothing for a user without a web plan', async () => {
    expect(await cancelWebSubscriptions('user_a', NOW)).toBe(0)
    expect(cancelSubscriptionMock).not.toHaveBeenCalled()
  })
})
