import { createHmac } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const insertOneMock = vi.fn(async (_doc: Record<string, unknown>) => ({}))
const updateOneMock = vi.fn(async () => ({}))
vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn(async () => ({ collection: () => ({ insertOne: insertOneMock, updateOne: updateOneMock }) })) }))

const recordMock = vi.fn(async (_userId: string, _subId: string) => ({ mode: 'paid' }))
vi.mock('@/lib/billing/service', () => ({ recordRazorpaySubscription: (u: string, s: string) => recordMock(u, s) }))

const { POST } = await import('./route')
const { BillingProviderError } = await import('@/lib/billing/providerError')

const SECRET = 'hook_secret'
const body = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    event: 'subscription.charged',
    payload: { subscription: { entity: { id: 'sub_1', status: 'active', plan_id: 'plan_month', current_end: 1, notes: { userId: 'user_a' } } } },
    ...over,
  })
const request = (raw: string, signature = createHmac('sha256', SECRET).update(raw).digest('hex')) =>
  new Request('https://example.com/api/billing/webhooks/razorpay', {
    method: 'POST',
    headers: { 'x-razorpay-signature': signature, 'x-razorpay-event-id': 'evt_1' },
    body: raw,
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_live_abc')
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'k')
  vi.stubEnv('RAZORPAY_PLAN_MONTHLY', 'plan_month')
  vi.stubEnv('RAZORPAY_PLAN_YEARLY', 'plan_year')
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/billing/webhooks/razorpay', () => {
  it('rejects a delivery whose signature does not match the body', async () => {
    const res = await POST(request(body(), createHmac('sha256', 'wrong').update(body()).digest('hex')))
    expect(res.status).toBe(401)
    expect(insertOneMock).not.toHaveBeenCalled()
  })

  it('rejects everything when the secret is not configured', async () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', '')
    expect((await POST(request(body()))).status).toBe(401)
  })

  it('stores the event once and re-verifies the subscription for its owner', async () => {
    const res = await POST(request(body()))
    expect(res.status).toBe(200)
    expect(insertOneMock.mock.calls[0][0]).toMatchObject({ provider: 'razorpay', environment: 'production', eventId: 'evt_1', userId: 'user_a', type: 'subscription.charged' })
    expect(recordMock).toHaveBeenCalledWith('user_a', 'sub_1')
    expect(updateOneMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ state: 'processed' }) }))
  })

  it('treats a redelivery as a no-op', async () => {
    insertOneMock.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }))
    const res = await POST(request(body()))
    expect(await res.json()).toMatchObject({ duplicate: true })
    expect(recordMock).not.toHaveBeenCalled()
  })

  it('ignores a subscription we did not create', async () => {
    const raw = body({ payload: { subscription: { entity: { id: 'sub_9', status: 'active', notes: [] } } } })
    const res = await POST(request(raw))
    expect(await res.json()).toMatchObject({ ignored: expect.any(String) })
    expect(recordMock).not.toHaveBeenCalled()
  })

  it('answers 200 and leaves the event for reconciliation when Razorpay is unreachable', async () => {
    recordMock.mockRejectedValueOnce(new BillingProviderError('Razorpay responded 503', 503))
    const res = await POST(request(body()))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ deferred: true })
    expect(updateOneMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ state: 'failed' }) }))
  })
})
