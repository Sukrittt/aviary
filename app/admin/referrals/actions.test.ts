import { beforeEach, expect, it, vi } from 'vitest'

const requireAdmin = vi.fn(async () => 'admin_1')
const insertOne = vi.fn(async (_d: unknown) => ({}))
const findOne = vi.fn()
const updateOne = vi.fn(async () => ({}))
const audit = vi.fn(async () => undefined)
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/admin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('@/lib/adminAudit', () => ({ audit: (...a: unknown[]) => audit(...(a as [])) }))
vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ collection: () => ({ insertOne, findOne, updateOne }) }) }))

const { createCodeAction, toggleCodeAction } = await import('./actions')
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }
const good = { code: ' priya ', label: 'Priya (Instagram)', refereeMonths: '2', referrerMonths: '0', offer: 'Priya got you two months of Pro' }

beforeEach(() => vi.clearAllMocks())

it('creates an uppercase creator code with its reward and audits it', async () => {
  expect(await createCodeAction(null, form(good))).toEqual({ ok: true, message: 'PRIYA is live' })
  expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({ _id: 'PRIYA', kind: 'creator', ownerId: null, refereeMonths: 2, referrerMonths: 0, active: true }))
  expect(audit).toHaveBeenCalledWith('admin_1', 'referral.code_create', null, expect.objectContaining({ code: 'PRIYA' }))
})

it.each([
  [{ code: 'two words' }, /3 to 16/],
  [{ code: 'AB' }, /3 to 16/],
  [{ label: '' }, /who this code is for/],
  [{ refereeMonths: '0' }, /whole numbers/],
  [{ refereeMonths: '13' }, /whole numbers/],
])('refuses %o', async (bad, message) => {
  const res = await createCodeAction(null, form({ ...good, ...bad }))
  expect(res?.ok).toBe(false)
  expect(res?.message).toMatch(message)
  expect(insertOne).not.toHaveBeenCalled()
})

it('never promises the creator months: a creator code has no account to give them to', async () => {
  await createCodeAction(null, form({ ...good, referrerMonths: '3' }))
  expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({ referrerMonths: 0 }))
})

it('says when a code is taken', async () => {
  insertOne.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }))
  expect(await createCodeAction(null, form(good))).toEqual({ ok: false, message: 'PRIYA is taken' })
})

it('pauses and resumes', async () => {
  findOne.mockResolvedValueOnce({ _id: 'PRIYA', active: true, ownerId: null })
  expect(await toggleCodeAction('PRIYA', null)).toEqual({ ok: true, message: 'PRIYA paused' })
  expect(updateOne).toHaveBeenCalledWith({ _id: 'PRIYA' }, { $set: { active: false } })
})

it('is admin only', async () => {
  requireAdmin.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
  await expect(createCodeAction(null, form(good))).rejects.toThrow()
  expect(insertOne).not.toHaveBeenCalled()
})
