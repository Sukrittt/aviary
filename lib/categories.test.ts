import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertOne = vi.fn()
const findOne = vi.fn()
const history = vi.fn()
const createBudgetRow = vi.fn()
vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))
vi.mock('@/lib/budgets', () => ({ createBudgetRow: (...args: unknown[]) => createBudgetRow(...args) }))
vi.mock('@/src/lib/envelope', () => ({ currentMonthKey: () => '2027-02' }))
vi.mock('@/lib/http', () => ({
  getCollection: async (name: string) => ({
    findOne: (...args: unknown[]) => (name === 'categories' ? findOne(...args) : history(name, ...args)),
    insertOne: (...args: unknown[]) => insertOne(...args),
    find: () => ({ sort: () => ({ limit: () => ({ next: async () => ({ order: 4 }) }) }) }),
  }),
}))

const { createCategory } = await import('./categories')
const auth = { userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const }

beforeEach(() => {
  vi.clearAllMocks()
  findOne.mockResolvedValue(null)
  insertOne.mockResolvedValue({ insertedId: 'x' })
  history.mockResolvedValue(null)
})

describe('createCategory', () => {
  it('creates the category last in order', async () => {
    expect(await createCategory(auth, { name: 'Groceries', group: 'Essentials' })).toBe('created')
    expect(insertOne).toHaveBeenCalledWith({ name: 'Groceries', group: 'Essentials', order: 5 })
    expect(createBudgetRow).not.toHaveBeenCalled()
  })

  it('starts a re-created name fresh this month: no old target, old balance stays behind', async () => {
    history.mockImplementation(async (name: string) => (name === 'budgets' ? { month: '2026-10', category: 'Gym' } : null))
    expect(await createCategory(auth, { name: 'Gym', group: '' })).toBe('created')
    expect(insertOne).toHaveBeenCalledWith({ name: 'Gym', group: '', order: 5, since: '2027-02' })
    expect(createBudgetRow).toHaveBeenCalledWith(auth, { month: '2027-02', category: 'Gym', assigned: '0' })
  })

  it('leaves the target to a caller that writes this month\'s own, like setup import', async () => {
    history.mockResolvedValue({ category: 'Gym' })
    expect(await createCategory(auth, { name: 'Gym', group: '' }, { writesTarget: true })).toBe('created')
    expect(insertOne).toHaveBeenCalledWith({ name: 'Gym', group: '', order: 5, since: '2027-02' })
    expect(createBudgetRow).not.toHaveBeenCalled()
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
