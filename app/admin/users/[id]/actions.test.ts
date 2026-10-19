import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdminMock = vi.fn(async () => 'admin_1')
const findOneMock = vi.fn()
const purgeMock = vi.fn(async () => ({ rows: 3, blobs: 1 }))
const softDeleteMock = vi.fn(async () => 'ts')
const auditMock = vi.fn(async () => undefined)
const redirectMock = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => redirectMock(path) }))
vi.mock('@/lib/admin', () => ({ requireAdmin: () => requireAdminMock() }))
vi.mock('@/lib/adminAudit', () => ({ audit: (...args: unknown[]) => auditMock(...(args as [])) }))
vi.mock('@/lib/workosClient', () => ({ getWorkOSClient: vi.fn() }))
vi.mock('@/lib/accountLifecycle', () => ({
  purgeAccountNow: (...args: unknown[]) => purgeMock(...(args as [])),
  softDeleteAccount: (...args: unknown[]) => softDeleteMock(...(args as [])),
  restoreAccount: vi.fn(),
}))
const updateOneMock = vi.fn(async () => ({}))
vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn(async () => ({ collection: () => ({ findOne: findOneMock, updateOne: updateOneMock }) })) }))

const { hardDeleteAction, softDeleteAction, updateUserAction } = await import('./actions')

const form = (email: string) => {
  const f = new FormData()
  f.set('confirmEmail', email)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  findOneMock.mockResolvedValue({ _id: 'user_2', email: 'Victim@Example.com' })
})

describe('hardDeleteAction', () => {
  it('refuses when the typed email does not match', async () => {
    expect(await hardDeleteAction('user_2', null, form('someone@else.com'))).toEqual({ ok: false, message: 'Typed email does not match' })
    expect(purgeMock).not.toHaveBeenCalled()
  })

  it("refuses the admin's own account", async () => {
    expect((await hardDeleteAction('admin_1', null, form('x')))?.ok).toBe(false)
    expect(purgeMock).not.toHaveBeenCalled()
  })

  it('purges, audits and redirects on a case-insensitive email match', async () => {
    await hardDeleteAction('user_2', null, form(' victim@example.com '))
    expect(purgeMock).toHaveBeenCalledWith(expect.anything(), 'user_2')
    expect(auditMock).toHaveBeenCalledWith('admin_1', 'user.hard_delete', 'user_2', { email: 'Victim@Example.com', rows: 3, blobs: 1 })
    expect(redirectMock).toHaveBeenCalledWith('/admin/users')
  })

  it('does nothing when requireAdmin rejects', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(hardDeleteAction('user_2', null, form('victim@example.com'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(purgeMock).not.toHaveBeenCalled()
  })
})

describe('softDeleteAction', () => {
  it('skips an account already scheduled for deletion', async () => {
    findOneMock.mockResolvedValue({ _id: 'user_2', email: 'v@e.com', deleted_at: '2026-01-01' })
    expect((await softDeleteAction('user_2'))?.ok).toBe(false)
    expect(softDeleteMock).not.toHaveBeenCalled()
  })
})

describe('updateUserAction budget limit', () => {
  const edit = (budgetLimit: string) => {
    const f = new FormData()
    for (const [k, v] of Object.entries({ name: '', currencyCode: 'INR', notifyCadence: 'weekly', notifyBillLeadDays: '3', budgetLimit })) f.set(k, v)
    return f
  }

  it('raises one person’s budget limit and audits it', async () => {
    findOneMock.mockResolvedValue({ _id: 'user_2', name: null, currencyCode: 'INR', notifyCadence: 'weekly', notifyBillLeadDays: 3, notifyThresholds: false, notifyBills: false, notifyCoach: false, notifyWrapped: false })
    expect((await updateUserAction('user_2', null, edit('8')))?.ok).toBe(true)
    expect(updateOneMock).toHaveBeenCalledWith({ _id: 'user_2' }, { $set: expect.objectContaining({ budgetLimit: 8 }) })
    expect(auditMock).toHaveBeenCalledWith('admin_1', 'user.update', 'user_2', { changes: expect.objectContaining({ budgetLimit: { from: null, to: 8 } }) })
  })

  it('refuses a nonsense limit', async () => {
    expect((await updateUserAction('user_2', null, edit('0')))?.ok).toBe(false)
    expect(updateOneMock).not.toHaveBeenCalled()
  })
})
