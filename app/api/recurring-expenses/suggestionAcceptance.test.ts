import { beforeEach, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
const mocks = vi.hoisted(() => ({ insert: vi.fn(), find: vi.fn(), existing: vi.fn(), suggestion: vi.fn(), subscriptions: vi.fn() }))
vi.mock('@/lib/access', () => ({ getAuth: async () => ({ userId: 'u', readOnly: false }), readOnlyGuard: () => null }))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: async () => null }))
vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))
vi.mock('@/lib/userCurrency', () => ({ nowForUser: async () => ({ date: '2026-09-22', timestamp: '2026-09-22T10:00:00Z' }) }))
vi.mock('@/lib/http', async original => ({ ...await original<typeof import('@/lib/http')>(), getCollection: async (name: string) => name === 'recurring_detection' ? { findOne: mocks.suggestion } : name === 'subscriptions' ? { find: () => ({ toArray: mocks.subscriptions }) } : { findOne: mocks.existing, find: () => ({ toArray: mocks.find }), insertOne: mocks.insert } }))
import { POST } from './route'
const id = new ObjectId().toHexString()
const fields = { suggestion_id: id, item: 'Netflix', amount_inr: '649', category: 'Entertainment', frequency: 'monthly', start_date: '2026-10-05' }
const request = (changes = {}) => new Request('https://example.com/api/recurring-expenses', { method: 'POST', body: JSON.stringify({ ...fields, ...changes }) })
beforeEach(() => {
  vi.clearAllMocks(); mocks.existing.mockResolvedValue(null); mocks.suggestion.mockResolvedValue({ decision: { pattern: 'other_recurring', frequency: 'monthly' } }); mocks.find.mockResolvedValue([]); mocks.subscriptions.mockResolvedValue([]); mocks.insert.mockResolvedValue({ insertedId: new ObjectId(id) })
})
it('uses a stable id and schedules in the future', async () => {
  expect((await POST(request())).status).toBe(200)
  const doc = mocks.insert.mock.calls[0][0]
  expect(String(doc._id)).toBe(id)
  expect(doc.next_run_date).toBe('2026-10-05')
})
it('does not insert again on retry or concurrent duplicate', async () => {
  mocks.existing.mockResolvedValue({ _id: new ObjectId(id) })
  expect((await POST(request())).status).toBe(200)
  expect(mocks.insert).not.toHaveBeenCalled()
  mocks.existing.mockResolvedValueOnce(null).mockResolvedValue({ _id: new ObjectId(id) })
  mocks.insert.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }))
  expect((await POST(request())).status).toBe(200)
})
it('rejects dismissed suggestions, past dates, and already tracked subscriptions', async () => {
  expect((await POST(request({ start_date: '2026-09-22' }))).status).toBe(400)
  mocks.suggestion.mockResolvedValue({ decision: {}, dismissed: true })
  expect((await POST(request())).status).toBe(409)
  mocks.suggestion.mockResolvedValue({ decision: {} })
  mocks.subscriptions.mockResolvedValue([{ service: 'NETFLIX' }])
  expect((await POST(request())).status).toBe(409)
  expect(mocks.insert).not.toHaveBeenCalled()
})

it('sets a subscription-classified suggestion up as a recurring expense, for accounts without Subscriptions', async () => {
  mocks.suggestion.mockResolvedValue({ decision: { pattern: 'subscription', frequency: 'monthly' } })
  expect((await POST(request())).status).toBe(200)
  expect(String(mocks.insert.mock.calls[0][0]._id)).toBe(id)
})

it('does not report a deleted schedule as newly created on an id collision', async () => {
  mocks.insert.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }))
  expect((await POST(request())).status).toBe(409)
})
