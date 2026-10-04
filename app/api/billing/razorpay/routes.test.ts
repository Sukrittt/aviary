import { createHmac } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const authMock = vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: 's' }))
vi.mock('@/lib/access', () => ({ getAuth: () => authMock() }))
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: vi.fn(async () => false) }))

const flagsMock = vi.fn(async () => ({ enforced: true, purchaseEnabled: true }))
vi.mock('@/lib/billing/flags', () => ({ billingFlagsFor: () => flagsMock() }))

const findMock = vi.fn(() => ({ toArray: async () => [] as unknown[] }))
vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn(async () => ({ collection: () => ({ find: findMock }) })) }))

const getAccessMock = vi.fn(async (): Promise<Record<string, unknown>> => ({ mode: 'expired', gifted: false, store: null }))
const recordMock = vi.fn(async (): Promise<Record<string, unknown>> => ({ mode: 'paid', store: 'web' }))
const cancelRowMock = vi.fn(async () => undefined)
vi.mock('@/lib/billing/service', async () => {
  class RazorpaySubscriptionOwnerError extends Error {}
  return {
    getAccess: () => getAccessMock(),
    recordRazorpaySubscription: () => recordMock(),
    cancelRazorpayRow: () => cancelRowMock(),
    RazorpaySubscriptionOwnerError,
  }
})

const createMock = vi.fn(async () => ({ id: 'sub_new' }))
vi.mock('@/lib/billing/razorpay', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing/razorpay')>()),
  createSubscription: (...args: unknown[]) => createMock(...(args as [])),
}))

const subscribe = (await import('./subscribe/route')).POST
const verify = (await import('./verify/route')).POST
const cancel = (await import('./cancel/route')).POST
const service = await import('@/lib/billing/service')
const { BillingProviderError } = await import('@/lib/billing/providerError')

const post = (body: unknown = {}) =>
  new Request('https://example.com/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_abc')
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'key_secret')
  vi.stubEnv('RAZORPAY_PLAN_MONTHLY', 'plan_month')
  vi.stubEnv('RAZORPAY_PLAN_YEARLY', 'plan_year')
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/billing/razorpay/subscribe', () => {
  it('creates a subscription on the chosen plan for the signed-in user', async () => {
    const res = await subscribe(post({ period: 'yearly' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ subscriptionId: 'sub_new', keyId: 'rzp_test_abc' })
    expect(createMock).toHaveBeenCalledWith('plan_year', 'yearly', 'user_a', null)
  })

  it('starts charging when the trial ends, so subscribing early keeps the trial days left', async () => {
    const trialEndsAt = new Date(Date.now() + 13 * 24 * 60 * 60 * 1000).toISOString()
    getAccessMock.mockResolvedValueOnce({ mode: 'trial', gifted: false, store: null, trialEndsAt })
    expect((await subscribe(post({ period: 'yearly' }))).status).toBe(200)
    expect(createMock).toHaveBeenCalledWith('plan_year', 'yearly', 'user_a', new Date(trialEndsAt))
  })

  it('charges now when the trial is all but over', async () => {
    getAccessMock.mockResolvedValueOnce({ mode: 'trial', gifted: false, store: null, trialEndsAt: new Date(Date.now() + 60_000).toISOString() })
    await subscribe(post({ period: 'yearly' }))
    expect(createMock).toHaveBeenCalledWith('plan_year', 'yearly', 'user_a', null)
  })

  it('refuses the demo user', async () => {
    authMock.mockResolvedValueOnce({ userId: 'demo', readOnly: true, sessionId: null as never })
    expect((await subscribe(post({ period: 'monthly' }))).status).toBe(401)
  })

  it('stays closed until purchases are switched on', async () => {
    flagsMock.mockResolvedValueOnce({ enforced: true, purchaseEnabled: false })
    expect((await subscribe(post({ period: 'monthly' }))).status).toBe(403)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('rejects an unknown period', async () => {
    expect((await subscribe(post({ period: 'weekly' }))).status).toBe(400)
  })

  it('won’t bill someone who already has a paid plan, on Play or here', async () => {
    getAccessMock.mockResolvedValueOnce({ mode: 'paid', gifted: false, store: 'play', paidExpiresAt: '2027-01-01T00:00:00.000Z' })
    const res = await subscribe(post({ period: 'monthly' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'already_subscribed', store: 'play' })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('lets someone on a gifted plan buy', async () => {
    getAccessMock.mockResolvedValueOnce({ mode: 'paid', gifted: true, store: null })
    expect((await subscribe(post({ period: 'monthly' }))).status).toBe(200)
  })

  it('is unavailable when web checkout is not configured', async () => {
    vi.stubEnv('RAZORPAY_KEY_ID', '')
    expect((await subscribe(post({ period: 'monthly' }))).status).toBe(503)
  })
})

describe('POST /api/billing/razorpay/verify', () => {
  const signed = (paymentId: string, subscriptionId: string) => ({
    paymentId,
    subscriptionId,
    signature: createHmac('sha256', 'key_secret').update(`${paymentId}|${subscriptionId}`).digest('hex'),
  })

  it('records a correctly signed checkout and returns the new access', async () => {
    const res = await verify(post(signed('pay_1', 'sub_1')))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ mode: 'paid', store: 'web', purchaseEnabled: true })
  })

  it('rejects a forged signature without asking Razorpay', async () => {
    const res = await verify(post({ ...signed('pay_1', 'sub_1'), subscriptionId: 'sub_2' }))
    expect(res.status).toBe(400)
    expect(recordMock).not.toHaveBeenCalled()
  })

  it("refuses a subscription that belongs to another account", async () => {
    recordMock.mockRejectedValueOnce(new service.RazorpaySubscriptionOwnerError('nope'))
    expect((await verify(post(signed('pay_1', 'sub_1')))).status).toBe(403)
  })

  it('hands back the existing access, unchanged, when Razorpay is unreachable', async () => {
    recordMock.mockRejectedValueOnce(new BillingProviderError('down', 0))
    const res = await verify(post(signed('pay_1', 'sub_1')))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ mode: 'expired', refreshed: false })
  })
})

describe('POST /api/billing/razorpay/cancel', () => {
  it('404s when there is no renewing web subscription (a Play one is cancelled in Play)', async () => {
    expect((await cancel(post())).status).toBe(404)
    expect(cancelRowMock).not.toHaveBeenCalled()
  })

  it('cancels each renewing web subscription and returns the access', async () => {
    findMock.mockReturnValueOnce({ toArray: async () => [{ storeTransactionId: 'sub_1' }] })
    getAccessMock.mockResolvedValueOnce({ mode: 'paid', autoRenew: false, store: 'web' })
    const res = await cancel(post())
    expect(res.status).toBe(200)
    expect(cancelRowMock).toHaveBeenCalledTimes(1)
    expect(await res.json()).toMatchObject({ autoRenew: false })
  })

  it('503s when Razorpay refuses, so the user knows it did not go through', async () => {
    findMock.mockReturnValueOnce({ toArray: async () => [{ storeTransactionId: 'sub_1' }] })
    cancelRowMock.mockRejectedValueOnce(new BillingProviderError('down', 0))
    expect((await cancel(post())).status).toBe(503)
  })
})
