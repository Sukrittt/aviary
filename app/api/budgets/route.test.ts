import { beforeEach, describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null })),
  readOnlyGuard: vi.fn(() => null),
}))

vi.mock('@/lib/cache', () => ({
  invalidate: vi.fn(),
}))

const insertOneMock = vi.fn()
const findOneMock = vi.fn()
const findMock = vi.fn()
const updateOneMock = vi.fn()
const deleteOneMock = vi.fn()
const reconcileThresholdLevelsMock = vi.fn(async (_auth: unknown, _categories: string[], _month?: string) => {})

vi.mock('@/lib/notifications/instant', () => ({
  reconcileThresholdLevels: (auth: unknown, categories: string[], month?: string) =>
    reconcileThresholdLevelsMock(auth, categories, month),
}))

vi.mock('@/lib/categoryName', () => ({
  resolveCategoryName: vi.fn(async (_auth: unknown, category: string) => category),
}))

vi.mock('@/lib/mongodb', () => ({
  withTx: async (fn: (session: undefined) => Promise<unknown>) => fn(undefined),
}))

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async () => ({
      insertOne: insertOneMock,
      findOne: findOneMock,
      find: findMock,
      updateOne: updateOneMock,
      deleteOne: deleteOneMock,
    })),
  }
})

const { POST, PUT, DELETE } = await import('./route')

function req(body: unknown, method = 'POST'): Request {
  return new Request('https://example.com/api/budgets', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  insertOneMock.mockReset()
  findOneMock.mockReset().mockResolvedValue({ _id: 'budget-1', month: '2026-01', category: 'Groceries', assigned: '5000', rolled_over: '0', version: 0 })
  findMock.mockReset().mockReturnValue({ toArray: async () => [] })
  updateOneMock.mockReset().mockResolvedValue({ matchedCount: 1 })
  deleteOneMock.mockReset().mockResolvedValue({ deletedCount: 1 })
  reconcileThresholdLevelsMock.mockClear()
})

describe('POST /api/budgets (C4)', () => {
  it('returns 409, not a raw 500, when the unique index rejects a duplicate month/category', async () => {
    const duplicateKeyError = Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
    insertOneMock.mockRejectedValueOnce(duplicateKeyError)

    const res = await POST(req({ month: '2026-01', category: 'Groceries', assigned: '5000' }))
    expect(res.status).toBe(409)
  })

  it('re-throws a non-duplicate-key error instead of masking it as a conflict', async () => {
    insertOneMock.mockRejectedValueOnce(new Error('connection reset'))
    await expect(POST(req({ month: '2026-01', category: 'Groceries', assigned: '5000' }))).rejects.toThrow(
      'connection reset',
    )
  })

  it('succeeds normally when there is no conflict', async () => {
    insertOneMock.mockResolvedValueOnce({ insertedId: '1' })
    const res = await POST(req({ month: '2026-01', category: 'Groceries', assigned: '5000' }))
    expect(res.status).toBe(200)
    expect(reconcileThresholdLevelsMock).toHaveBeenCalledWith(
      { userId: 'user_a', readOnly: false, sessionId: null },
      ['Groceries'],
      '2026-01',
    )
  })

  it('accepts a negative assignment, which transfers can leave behind', async () => {
    const res = await PUT(req({ month: '2026-01', category: 'Groceries', assigned: '-10', version: 0 }, 'PUT'))
    expect(res.status).toBe(200)
  })

  it('reconciles the affected category after an assignment update', async () => {
    const res = await PUT(req({ month: '2026-01', category: 'Groceries', assigned: '8000', version: 0 }, 'PUT'))
    expect(res.status).toBe(200)
    expect(reconcileThresholdLevelsMock).toHaveBeenCalledWith(
      { userId: 'user_a', readOnly: false, sessionId: null },
      ['Groceries'],
      '2026-01',
    )
  })

  it('keeps the carried-forward assignment when the first edit of a month only touches rollover', async () => {
    findOneMock.mockResolvedValueOnce(null)
    findMock.mockReturnValueOnce({ toArray: async () => [
      { month: '2025-12', category: 'Groceries', assigned: '5000' },
      { month: '2025-11', category: 'Groceries', assigned: '3000' },
    ] })
    insertOneMock.mockResolvedValueOnce({ insertedId: '1' })

    const res = await PUT(req({ month: '2026-01', category: 'Groceries', rolled_over: '20', version: 0 }, 'PUT'))
    expect(res.status).toBe(200)
    expect(insertOneMock.mock.calls[0][0]).toMatchObject({ assigned: '5000', rolled_over: '20' })
  })

  it('adds income extra to a month still carrying last month\'s income, keeping that income', async () => {
    findOneMock.mockResolvedValueOnce(null)
    findMock.mockReturnValueOnce({ toArray: async () => [{ month: '2025-12', category: '__income__', assigned: '100000' }] })
    insertOneMock.mockResolvedValueOnce({ insertedId: '1' })

    const res = await PUT(req({ month: '2026-01', category: '__income__', extra: '10000', version: 0 }, 'PUT'))
    expect(res.status).toBe(200)
    expect(insertOneMock.mock.calls[0][0]).toMatchObject({ assigned: '100000', extra: '10000' })
  })

  it('updates income extra on an existing row', async () => {
    const res = await PUT(req({ month: '2026-01', category: '__income__', extra: '2500', version: 0 }, 'PUT'))
    expect(res.status).toBe(200)
    expect(updateOneMock.mock.calls[0][1]).toMatchObject({ $set: { extra: '2500' } })
  })

  it('reconciles the affected category after an assignment is deleted', async () => {
    const res = await DELETE(req({ month: '2026-01', category: 'Groceries' }, 'DELETE'))
    expect(res.status).toBe(200)
    expect(reconcileThresholdLevelsMock).toHaveBeenCalledWith(
      { userId: 'user_a', readOnly: false, sessionId: null },
      ['Groceries'],
      '2026-01',
    )
  })
})
