import { describe, it, expect, vi, beforeEach } from 'vitest'

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

vi.mock('./razorpay', async (orig) => ({ ...(await orig<typeof import('./razorpay')>()), razorpayConfig: () => null }))

const fetchPayPalMock = vi.fn()
const cancelPayPalMock = vi.fn()
vi.mock('./paypal', async (orig) => ({
  ...(await orig<typeof import('./paypal')>()),
  paypalConfig: () => ({ clientId: 'c', clientSecret: 's', plans: { monthly: 'P-MONTH', yearly: 'P-YEAR' }, webhookId: 'WH', environment: 'production' }),
  fetchPayPalSubscription: (id: string) => fetchPayPalMock(id),
  cancelPayPalSubscription: (id: string) => cancelPayPalMock(id),
}))

const { recordPayPalSubscription, refreshFromProvider, cancelWebSubscriptions, SubscriptionOwnerError } = await import('./service')
const { PayPalError } = await import('./paypal')
import type { PpSubscription } from './paypal'

const NOW = new Date('2026-10-09T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()

function sub(over: Partial<PpSubscription> = {}): PpSubscription {
  return { id: 'I-1', plan_id: 'P-YEAR', status: 'ACTIVE', custom_id: 'user_a', billing_info: { last_payment: { time: at(-10) }, next_billing_time: at(355) }, ...over }
}

const account = { _id: 'user_a', trialStartedAt: new Date(NOW.getTime() - 60 * DAY), trialEndsAt: new Date(NOW.getTime() - 15 * DAY), trialCohort: 'onboarding-v1', createdAt: NOW }
const subs = () => store.billing_subscriptions ?? []

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(store)) delete store[k]
  store.billing_accounts = [{ ...account }]
  fetchSubscriberMock.mockResolvedValue(null)
  fetchPayPalMock.mockResolvedValue(sub())
  cancelPayPalMock.mockResolvedValue(undefined)
})

describe('recordPayPalSubscription', () => {
  it('writes a verified PayPal purchase and unlocks an expired account', async () => {
    const access = await recordPayPalSubscription('user_a', 'I-1', NOW)
    expect(access).toMatchObject({ mode: 'paid', allowed: true, store: 'web', basePlanId: 'yearly', autoRenew: true })
    expect(subs()[0]).toMatchObject({ userId: 'user_a', provider: 'paypal', environment: 'production', storeTransactionId: 'I-1' })
  })

  it("refuses someone else's subscription and writes nothing", async () => {
    fetchPayPalMock.mockResolvedValue(sub({ custom_id: 'user_b' }))
    await expect(recordPayPalSubscription('user_a', 'I-1', NOW)).rejects.toBeInstanceOf(SubscriptionOwnerError)
    expect(subs()).toHaveLength(0)
  })

  it("lets a webhook (no user) write under the subscription's own owner, but never an unowned one", async () => {
    await recordPayPalSubscription(null, 'I-1', NOW)
    expect(subs()[0].userId).toBe('user_a')
    fetchPayPalMock.mockResolvedValue(sub({ id: 'I-2', custom_id: undefined }))
    await expect(recordPayPalSubscription(null, 'I-2', NOW)).rejects.toBeInstanceOf(SubscriptionOwnerError)
  })
})

describe('refreshFromProvider', () => {
  it('re-reads the PayPal subscriptions already on record', async () => {
    await recordPayPalSubscription('user_a', 'I-1', NOW)
    fetchPayPalMock.mockResolvedValue(sub({ status: 'SUSPENDED' }))
    const access = await refreshFromProvider('user_a', new Date(NOW.getTime() + 1000))
    expect(access).toMatchObject({ mode: 'expired', renewalState: 'on_hold', store: 'web' })
  })

  it('reports a PayPal outage instead of writing it down as a lapse', async () => {
    await recordPayPalSubscription('user_a', 'I-1', NOW)
    fetchPayPalMock.mockRejectedValue(new PayPalError('PayPal responded 503', 503))
    await expect(refreshFromProvider('user_a', new Date(NOW.getTime() + 1000))).rejects.toBeInstanceOf(PayPalError)
    expect(subs()[0].status).toBe('active')
  })
})

describe('cancelWebSubscriptions', () => {
  it('cancels a renewing PayPal plan and keeps the paid access', async () => {
    await recordPayPalSubscription('user_a', 'I-1', NOW)
    fetchPayPalMock.mockResolvedValue(sub({ status: 'CANCELLED', billing_info: { last_payment: { time: at(-10) } } }))
    expect(await cancelWebSubscriptions('user_a', new Date(NOW.getTime() + 1000))).toBe(1)
    expect(cancelPayPalMock).toHaveBeenCalledWith('I-1')
    expect(subs()[0]).toMatchObject({ cancelAtPeriodEnd: true, status: 'cancelled', autoRenew: false })
    const access = await refreshFromProvider('user_a', new Date(NOW.getTime() + 2000))
    expect(access).toMatchObject({ mode: 'paid', autoRenew: false, renewalState: 'cancelled' })
  })

  it("skips one still waiting for approval, which PayPal can't cancel and can't charge", async () => {
    fetchPayPalMock.mockResolvedValue(sub({ status: 'APPROVAL_PENDING', billing_info: {} }))
    await recordPayPalSubscription('user_a', 'I-1', NOW)
    expect(await cancelWebSubscriptions('user_a', NOW)).toBe(0)
    expect(cancelPayPalMock).not.toHaveBeenCalled()
  })

  it('leaves the row saying it renews when PayPal refuses the cancel', async () => {
    await recordPayPalSubscription('user_a', 'I-1', NOW)
    cancelPayPalMock.mockRejectedValue(new PayPalError('PayPal responded 502', 502))
    await expect(cancelWebSubscriptions('user_a', NOW)).rejects.toThrow('502')
    expect(subs()[0].cancelAtPeriodEnd).toBeUndefined()
  })
})
