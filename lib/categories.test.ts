import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertOne = vi.fn()
const findOne = vi.fn()
vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))
vi.mock('@/lib/http', () => ({
  getCollection: async () => ({
    findOne: (...args: unknown[]) => findOne(...args),
    insertOne: (...args: unknown[]) => insertOne(...args),
    find: () => ({ sort: () => ({ limit: () => ({ next: async () => ({ order: 4 }) }) }) }),
  }),
}))

const { createCategory } = await import('./categories')
const auth = { userId: 'user_a', readOnly: false, sessionId: null }

beforeEach(() => {
  vi.clearAllMocks()
  findOne.mockResolvedValue(null)
  insertOne.mockResolvedValue({ insertedId: 'x' })
})

describe('createCategory', () => {
  it('creates the category last in order', async () => {
    expect(await createCategory(auth, { name: 'Groceries', group: 'Essentials' })).toBe('created')
    expect(insertOne).toHaveBeenCalledWith({ name: 'Groceries', group: 'Essentials', order: 5 })
  })

  it('reports an existing name without writing', async () => {
    findOne.mockResolvedValue({ name: 'Groceries' })
    expect(await createCategory(auth, { name: 'Groceries', group: 'Essentials' })).toBe('exists')
    expect(insertOne).not.toHaveBeenCalled()
  })

  it('reports a name a concurrent create won through the unique index', async () => {
    insertOne.mockRejectedValue({ code: 11000 })
    expect(await createCategory(auth, { name: 'Groceries', group: 'Essentials' })).toBe('exists')
  })
})
