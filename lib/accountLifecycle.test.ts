import { describe, it, expect, vi, beforeEach } from 'vitest'

const deleteUserMock = vi.fn()
const deleteManyMock = vi.fn(async () => ({ deletedCount: 2 }))
const deleteOneMock = vi.fn(async () => ({ deletedCount: 1 }))

vi.mock('./workosClient', () => ({ getWorkOSClient: () => ({ userManagement: { deleteUser: deleteUserMock } }) }))
const listMock = vi.fn(async (_opts: { prefix: string }) => ({ blobs: [] as { url: string }[], hasMore: false, cursor: undefined }))
vi.mock('@vercel/blob', () => ({ list: (opts: { prefix: string }) => listMock(opts), del: vi.fn() }))

const purgeUserIdeasMock = vi.fn(async () => 0)
vi.mock('./ideas', () => ({ purgeUserIdeas: purgeUserIdeasMock }))

const { purgeAccountNow } = await import('./accountLifecycle')
const collectionMock = vi.fn((_name: string) => ({ deleteMany: deleteManyMock, deleteOne: deleteOneMock, findOne: async () => null }))
const db = { collection: collectionMock } as never

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.BLOB_READ_WRITE_TOKEN
})

describe('purgeAccountNow', () => {
  it('keeps local data when WorkOS deletion fails', async () => {
    deleteUserMock.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
    await expect(purgeAccountNow(db, 'user_1')).rejects.toThrow('boom')
    expect(deleteManyMock).not.toHaveBeenCalled()
    expect(deleteOneMock).not.toHaveBeenCalled()
  })

  it('continues when the WorkOS user is already gone', async () => {
    deleteUserMock.mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }))
    const result = await purgeAccountNow(db, 'user_1')
    expect(deleteManyMock).toHaveBeenCalledWith({ user_id: 'user_1' })
    expect(deleteOneMock).toHaveBeenCalledWith({ _id: 'user_1' })
    expect(result.rows).toBeGreaterThan(0)
  })

  it('sweeps every per-user Blob prefix, expense photos included', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'token'
    await purgeAccountNow(db, 'user_1')
    expect(listMock.mock.calls.map(([o]) => o.prefix)).toEqual(['bills/user_1/', 'exports/user_1/', 'expense-photos/user_1/', 'feedback-screenshots/user_1/'])
  })

  it("deletes every per-user collection, the Ask Aviary brief cache included", async () => {
    await purgeAccountNow(db, 'user_1')
    const swept = collectionMock.mock.calls.map(([name]) => name)
    for (const name of ['ai_brief', 'incomes', 'recurring_incomes', 'accounts', 'ai_usage']) expect(swept).toContain(name)
  })

  it('takes their ideas and votes off the feedback board, and deletes their bug reports', async () => {
    await purgeAccountNow(db, 'user_1')
    expect(purgeUserIdeasMock).toHaveBeenCalledWith(db, 'user_1')
    expect(collectionMock).toHaveBeenCalledWith('feedback')
    expect(deleteManyMock).toHaveBeenCalledWith({ userId: 'user_1' })
  })
})
