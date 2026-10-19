import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const updateOne = vi.fn(async () => ({ modifiedCount: 1 }))
const collection = vi.fn(() => ({ updateOne }))
vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ collection }) }))
const { signLink } = await import('@/lib/email/links')
const { POST } = await import('./route')
const { GET: confirm } = await import('../confirm/route')

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('CRON_SECRET', 'test-secret') })
afterEach(() => vi.unstubAllEnvs())

const oneClick = (t: string) => new Request(`https://useaviary.com/api/email/unsubscribe?t=${encodeURIComponent(t)}`, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click',
})

it('unsubscribes a user with a one-click POST', async () => {
  const res = await POST(oneClick(signLink('u:user_1')))
  expect(res.status).toBe(200)
  expect(collection).toHaveBeenCalledWith('users')
  expect(updateOne).toHaveBeenCalledWith({ _id: 'user_1', emailOptOutAt: { $exists: false } }, { $set: { emailOptOutAt: expect.any(Date) } })
})

it('unsubscribes a lead from the page form and lands on the done state', async () => {
  const body = new URLSearchParams({ t: signLink('l:abc123'), from: 'page' })
  const res = await POST(new Request('https://useaviary.com/api/email/unsubscribe', { method: 'POST', body }))
  expect(res.status).toBe(303)
  expect(res.headers.get('location')).toBe('https://useaviary.com/emails?done=unsubscribed')
  expect(collection).toHaveBeenCalledWith('leads')
})

it('changes nothing for a forged token', async () => {
  const res = await POST(oneClick('u:user_1.forged'))
  expect(res.status).toBe(400)
  expect(updateOne).not.toHaveBeenCalled()
})

it('confirms only lead tokens, never a user one', async () => {
  expect((await confirm(new Request(`https://useaviary.com/api/email/confirm?t=${encodeURIComponent(signLink('l:abc123'))}`))).headers.get('location')).toBe('https://useaviary.com/emails?done=subscribed')
  expect(updateOne).toHaveBeenCalledOnce()
  expect((await confirm(new Request(`https://useaviary.com/api/email/confirm?t=${encodeURIComponent(signLink('u:user_1'))}`))).headers.get('location')).toBe('https://useaviary.com/emails?done=invalid')
  expect(updateOne).toHaveBeenCalledOnce()
})
