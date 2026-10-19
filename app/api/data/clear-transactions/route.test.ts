import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const })),
  readOnlyGuard: vi.fn(() => null),
}))

const invalidateMock = vi.fn()
vi.mock('@/lib/cache', () => ({ invalidate: invalidateMock }))

const invalidateCategoryMapMock = vi.fn()
vi.mock('@/lib/categoryMap', () => ({ invalidateCategoryMap: invalidateCategoryMapMock }))

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async () => ({
      deleteMany: vi.fn(async () => ({ deletedCount: 3 })),
    })),
  }
})

const { POST } = await import('./route')

describe('POST /api/data/clear-transactions (C5)', () => {
  it('invalidates budgets too, since clearing every expense changes every envelope spent figure', async () => {
    const res = await POST(
      new Request('https://example.com/api/data/clear-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      }),
    )
    expect(res.status).toBe(200)
    expect(invalidateMock).toHaveBeenCalledWith('expenses', 'user_a')
    expect(invalidateMock).toHaveBeenCalledWith('wrapped', 'user_a')
    expect(invalidateMock).toHaveBeenCalledWith('budgets', 'user_a')
    expect(invalidateCategoryMapMock).toHaveBeenCalledWith('user_a')
  })
})
