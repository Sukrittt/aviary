vi.mock('@/lib/email/subscription', () => ({ scheduleSubscriptionEmails: vi.fn() }))
import { createHmac } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const insertOneMock = vi.fn(async (_doc: Record<string, unknown>) => ({}))
const findOneMock = vi.fn(async () => ({ state: 'processed', userId: 'user_a', summary: { subscriptionId: 'sub_1' } }))
const updateOneMock = vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, Record<string, unknown>>) => ({}))
vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn(async () => ({ collection: () => ({ insertOne: insertOneMock, updateOne: updateOneMock, findOne: findOneMock }) })) }))

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

  it('asks the provider to retry and keeps the failed event when Razorpay is unreachable', async () => {
    recordMock.mockRejectedValueOnce(new BillingProviderError('Razorpay responded 503', 503))
    const res = await POST(request(body()))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ deferred: true })
    expect(updateOneMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ state: 'failed' }) }))
  })
})

it('re-verifies a previously failed duplicate using the persisted owner and purchase', async () => {
  insertOneMock.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }))
  findOneMock.mockResolvedValueOnce({ state: 'failed', userId: 'original_user', summary: { subscriptionId: 'original_sub' } })
  const res = await POST(request(body()))
  expect(res.status).toBe(200)
  expect(recordMock).toHaveBeenCalledWith('original_user', 'original_sub')
  expect(updateOneMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ state: 'processed' }) }))
})


it('keeps a successfully processed event when an overlapping duplicate fails later', async () => {
  const stored = { state: 'received', userId: 'user_a', summary: { subscriptionId: 'sub_1' } }
  let succeed!: (value: { mode: string }) => void
  let fail!: (error: Error) => void
  let firstStarted!: () => void
  let secondStarted!: () => void
  const first = new Promise<void>(resolve => { firstStarted = resolve })
  const second = new Promise<void>(resolve => { secondStarted = resolve })
  recordMock.mockImplementationOnce(() => { firstStarted(); return new Promise(resolve => { succeed = resolve }) })
  recordMock.mockImplementationOnce(() => { secondStarted(); return new Promise((_resolve, reject) => { fail = reject }) })
  insertOneMock.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }))
  findOneMock.mockResolvedValueOnce(stored)
  updateOneMock.mockImplementationOnce(async (_filter, update) => { stored.state = update.$set.state as string; return {} })
  updateOneMock.mockImplementationOnce(async (filter, update) => {
    const condition = filter.state as { $ne?: string } | undefined
    if (stored.state !== condition?.$ne) stored.state = update.$set.state as string
    return {}
  })
  const original = POST(request(body()))
  await first
  const duplicate = POST(request(body()))
  await second
  succeed({ mode: 'paid' })
  expect((await original).status).toBe(200)
  expect(stored.state).toBe('processed')
  fail(new BillingProviderError('provider unavailable', 503))
  expect((await duplicate).status).toBe(503)
  expect(stored.state).toBe('processed')
})
