import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const { insert, update, refresh, schedule } = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), refresh: vi.fn(), schedule: vi.fn() }))
vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ collection: () => ({ insertOne: insert, updateOne: update }) }) }))
vi.mock('@/lib/billing/service', () => ({ refreshFromProvider: refresh }))
vi.mock('@/lib/email/subscription', () => ({ scheduleSubscriptionEmails: schedule }))
const { POST } = await import('./route')
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('REVENUECAT_WEBHOOK_SECRET', 'secret'); refresh.mockResolvedValue({}); insert.mockResolvedValue({}); update.mockResolvedValue({}) })
afterEach(() => vi.unstubAllEnvs())
function request(fields: Record<string, unknown> = {}, secret = 'secret') {
  return new Request('https://example.com/api/billing/webhooks/revenuecat', { method: 'POST', headers: { authorization: secret }, body: JSON.stringify({ event: { id: 'evt_1', type: 'RENEWAL', app_user_id: 'user_a', environment: 'PRODUCTION', store: 'PLAY_STORE', product_id: 'monthly', transaction_id: 'order..1', original_transaction_id: 'order', ...fields } }) })
}
it('rejects unsigned events without queuing email', async () => {
  expect((await POST(request({}, 'wrong'))).status).toBe(401)
  expect(insert).not.toHaveBeenCalled()
  expect(schedule).not.toHaveBeenCalled()
})
it('marks a production renewal and preserves deduplication identifiers', async () => {
  expect((await POST(request())).status).toBe(200)
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ emailKind: 'paid', summary: expect.objectContaining({ transactionId: 'order..1', originalTransactionId: 'order' }) }))
  expect(schedule).toHaveBeenCalledOnce()
})
it.each([{ environment: 'SANDBOX' }, { period_type: 'TRIAL', type: 'INITIAL_PURCHASE' }, { price: 0 }, { store: 'PROMOTIONAL' }, { environment: undefined }])('excludes %j from payment email', async fields => {
  await POST(request(fields))
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ emailKind: null }))
})
it('defers email until a failed provider verification is repaired', async () => {
  refresh.mockRejectedValueOnce(new Error('unavailable'))
  expect(await (await POST(request())).json()).toMatchObject({ deferred: true })
  expect(update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ state: 'failed' }) }))
  expect(schedule).not.toHaveBeenCalled()
})
it('does not schedule a duplicate provider event', async () => {
  insert.mockRejectedValueOnce({ code: 11000 })
  expect(await (await POST(request())).json()).toMatchObject({ duplicate: true })
  expect(schedule).not.toHaveBeenCalled()
})
