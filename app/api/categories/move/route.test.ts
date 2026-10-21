import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const })),
  readOnlyGuard: vi.fn(() => null),
}))

const invalidateMock = vi.fn()
vi.mock('@/lib/cache', () => ({ invalidate: invalidateMock }))

// These tests drive in-memory collection doubles, so there is no real client to
// start a session on; run the transaction callback inline.
vi.mock('@/lib/mongodb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mongodb')>()),
  withTx: async (fn: (session: unknown) => unknown) => fn(undefined),
}))

const docs = [
  { name: 'Rent', group: 'Home', order: 0 },
  { name: 'Groceries', group: 'Home', order: 1 },
]

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async () => ({
      findOne: async (filter: { name: string }) => docs.find((d) => d.name === filter.name) ?? null,
      find: () => ({ sort: () => ({ toArray: async () => docs }) }),
      bulkWrite: vi.fn(async () => ({})),
    })),
  }
})

const { POST } = await import('./route')

describe('POST /api/categories/move (C3)', () => {
  it('invalidates the categories cache after reordering', async () => {
    const res = await POST(
      new Request('https://example.com/api/categories/move', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Rent', toIndex: 1 }),
      }),
    )
    expect(res.status).toBe(200)
    expect(invalidateMock).toHaveBeenCalledWith('categories', 'user_a')
  })
})
