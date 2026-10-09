import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const authMock = vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: 's' }))
vi.mock('@/lib/access', () => ({ getAuth: () => authMock() }))
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: vi.fn(async () => false) }))

const flagsMock = vi.fn(async () => ({ enforced: true, purchaseEnabled: true }))
vi.mock('@/lib/billing/flags', () => ({ billingFlagsFor: () => flagsMock() }))

const getAccessMock = vi.fn(async (): Promise<Record<string, unknown>> => ({ mode: 'expired', gifted: false, store: null }))
const recordMock = vi.fn(async (_userId: string | null, _id: string): Promise<Record<string, unknown>> => ({ mode: 'paid', store: 'web' }))
vi.mock('@/lib/billing/service', async () => {
  class SubscriptionOwnerError extends Error {}
  return {
    getAccess: () => getAccessMock(),
    recordPayPalSubscription: (u: string | null, id: string) => recordMock(u, id),
    SubscriptionOwnerError,
  }
})

const createMock = vi.fn(async (_opts: Record<string, unknown>) => ({ id: 'I-NEW', approveUrl: 'https://paypal.test/approve' }))
vi.mock('@/lib/billing/paypal', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing/paypal')>()),
  createPayPalSubscription: (opts: Record<string, unknown>) => createMock(opts),
}))

const subscribe = (await import('./subscribe/route')).POST
const verify = (await import('./verify/route')).POST
const service = await import('@/lib/billing/service')
const { BillingProviderError } = await import('@/lib/billing/providerError')

const post = (body: unknown = {}) =>
  new Request('https://www.useaviary.com/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PAYPAL_CLIENT_ID', 'client')
  vi.stubEnv('PAYPAL_CLIENT_SECRET', 'secret')
  vi.stubEnv('PAYPAL_PLAN_MONTHLY', 'P-MONTH')
  vi.stubEnv('PAYPAL_PLAN_YEARLY', 'P-YEAR')
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/billing/paypal/subscribe', () => {
  it("creates a subscription on the chosen plan and returns PayPal's approval page", async () => {
    const res = await subscribe(post({ period: 'yearly' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ approveUrl: 'https://paypal.test/approve' })
    expect(createMock).toHaveBeenCalledWith({
      planId: 'P-YEAR',
      userId: 'user_a',
      startAt: null,
      returnUrl: 'https://www.useaviary.com/account?checkout=paypal',
      cancelUrl: 'https://www.useaviary.com/account?checkout=paypal-cancelled',
    })
  })

  it('defers the first charge to the end of the trial', async () => {
    const trialEndsAt = new Date(Date.now() + 13 * 24 * 60 * 60 * 1000).toISOString()
    getAccessMock.mockResolvedValueOnce({ mode: 'trial', gifted: false, store: null, trialEndsAt })
    await subscribe(post({ period: 'monthly' }))
    expect(createMock.mock.calls[0][0]).toMatchObject({ planId: 'P-MONTH', startAt: new Date(trialEndsAt) })
  })

  it('refuses someone who already pays, before purchases open, and when PayPal is off', async () => {
    getAccessMock.mockResolvedValueOnce({ mode: 'paid', gifted: false, store: 'play' })
    expect((await subscribe(post({ period: 'yearly' }))).status).toBe(409)
    flagsMock.mockResolvedValueOnce({ enforced: true, purchaseEnabled: false })
    expect((await subscribe(post({ period: 'yearly' }))).status).toBe(403)
    vi.stubEnv('PAYPAL_PLAN_YEARLY', '')
    expect((await subscribe(post({ period: 'yearly' }))).status).toBe(503)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('says checkout is unavailable when PayPal is down', async () => {
    createMock.mockRejectedValueOnce(new BillingProviderError('PayPal responded 500', 500))
    expect((await subscribe(post({ period: 'yearly' }))).status).toBe(503)
  })
})

describe('POST /api/billing/paypal/verify', () => {
  it('re-verifies the returned subscription for the signed-in user', async () => {
    const res = await verify(post({ subscriptionId: 'I-NEW' }))
    expect(res.status).toBe(200)
    expect(recordMock).toHaveBeenCalledWith('user_a', 'I-NEW')
    expect(await res.json()).toMatchObject({ mode: 'paid', purchaseEnabled: true })
  })

  it("refuses another account's subscription", async () => {
    recordMock.mockRejectedValueOnce(new service.SubscriptionOwnerError('nope'))
    expect((await verify(post({ subscriptionId: 'I-NEW' }))).status).toBe(403)
  })

  it('returns the unchanged access with a 503 when PayPal is unreachable', async () => {
    recordMock.mockRejectedValueOnce(new BillingProviderError('PayPal responded 503', 503))
    const res = await verify(post({ subscriptionId: 'I-NEW' }))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ mode: 'expired', refreshed: false })
  })

  it('needs a subscription id', async () => {
    expect((await verify(post({}))).status).toBe(400)
  })
})
