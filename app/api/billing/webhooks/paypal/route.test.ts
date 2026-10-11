vi.mock('@/lib/email/subscription', () => ({ scheduleSubscriptionEmails: vi.fn() }))
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const insertOneMock = vi.fn(async (_doc: Record<string, unknown>) => ({}))
const findOneMock = vi.fn(async (): Promise<Record<string, unknown> | null> => null)
const updateOneMock = vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, Record<string, unknown>>) => ({}))
vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn(async () => ({ collection: () => ({ insertOne: insertOneMock, updateOne: updateOneMock, findOne: findOneMock }) })) }))

const recordMock = vi.fn(async (_userId: string | null, _subId: string) => ({ mode: 'paid' }))
vi.mock('@/lib/billing/service', () => {
  class SubscriptionOwnerError extends Error {}
  return { recordPayPalSubscription: (u: string | null, s: string) => recordMock(u, s), SubscriptionOwnerError }
})

const verifyMock = vi.fn(async (_headers: Headers, _raw: string) => true)
vi.mock('@/lib/billing/paypal', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing/paypal')>()),
  verifyPayPalWebhook: (h: Headers, raw: string) => verifyMock(h, raw),
}))

const { POST } = await import('./route')
const service = await import('@/lib/billing/service')
const { BillingProviderError } = await import('@/lib/billing/providerError')

const event = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ id: 'WH-1', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-1', status: 'ACTIVE', plan_id: 'P-MONTH', custom_id: 'user_a' }, ...over })
const request = (raw: string) => new Request('https://example.com/api/billing/webhooks/paypal', { method: 'POST', body: raw })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PAYPAL_CLIENT_ID', 'client')
  vi.stubEnv('PAYPAL_CLIENT_SECRET', 'secret')
  vi.stubEnv('PAYPAL_PLAN_MONTHLY', 'P-MONTH')
  vi.stubEnv('PAYPAL_PLAN_YEARLY', 'P-YEAR')
  vi.stubEnv('PAYPAL_ENV', 'live')
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/billing/webhooks/paypal', () => {
  it("rejects a delivery PayPal doesn't vouch for", async () => {
    verifyMock.mockResolvedValueOnce(false)
    expect((await POST(request(event()))).status).toBe(401)
    expect(insertOneMock).not.toHaveBeenCalled()
  })

  it('asks for a redelivery when the signature check itself is unavailable', async () => {
    verifyMock.mockRejectedValueOnce(new BillingProviderError('PayPal responded 503', 503))
    expect((await POST(request(event()))).status).toBe(503)
    expect(insertOneMock).not.toHaveBeenCalled()
  })

  it('stores the event once and re-verifies the subscription for its owner', async () => {
    const res = await POST(request(event()))
    expect(res.status).toBe(200)
    expect(insertOneMock.mock.calls[0][0]).toMatchObject({ provider: 'paypal', environment: 'production', eventId: 'WH-1', userId: 'user_a', type: 'BILLING.SUBSCRIPTION.ACTIVATED' })
    expect(recordMock).toHaveBeenCalledWith('user_a', 'I-1')
    expect(updateOneMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ state: 'processed' }) }))
  })

  it('finds the subscription behind a sale, and queues a receipt', async () => {
    const raw = event({ event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'SALE-1', billing_agreement_id: 'I-1', custom: 'user_a' } })
    expect((await POST(request(raw))).status).toBe(200)
    expect(insertOneMock.mock.calls[0][0]).toMatchObject({ emailKind: 'paid', summary: expect.objectContaining({ subscriptionId: 'I-1', paymentId: 'SALE-1' }) })
    expect(recordMock).toHaveBeenCalledWith('user_a', 'I-1')
  })

  it('ignores payments that belong to no subscription', async () => {
    const raw = event({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP-1' } })
    expect(await (await POST(request(raw))).json()).toMatchObject({ ignored: 'no subscription' })
    expect(insertOneMock).not.toHaveBeenCalled()
  })

  it('treats a processed redelivery as a no-op', async () => {
    insertOneMock.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }))
    findOneMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ state: 'processed' })
    expect(await (await POST(request(event()))).json()).toMatchObject({ duplicate: true })
    expect(recordMock).not.toHaveBeenCalled()
  })

  it("acknowledges a subscription that isn't ours instead of making PayPal retry it", async () => {
    recordMock.mockRejectedValueOnce(new service.SubscriptionOwnerError('nope'))
    expect((await POST(request(event()))).status).toBe(200)
  })

  it('keeps the event and asks PayPal to retry when re-verification fails', async () => {
    recordMock.mockRejectedValueOnce(new BillingProviderError('PayPal responded 500', 500))
    expect((await POST(request(event()))).status).toBe(503)
    expect(updateOneMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ state: 'failed' }) }))
  })
})
