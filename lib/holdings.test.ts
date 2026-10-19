import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))

// withTx just runs the callback with an undefined "session" — the fake
// collections below don't care about it, they only assert on filter/update.
vi.mock('@/lib/mongodb', () => ({
  withTx: async (fn: (session: undefined) => Promise<unknown>) => fn(undefined),
}))

const holdingsFindOne = vi.fn()
const holdingsUpdateOne = vi.fn()
const budgetsFindOne = vi.fn()
const eventsInsertOne = vi.fn()

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async (base: string) => {
      if (base === 'holdings') return { findOne: holdingsFindOne, updateOne: holdingsUpdateOne }
      if (base === 'budgets') return { findOne: budgetsFindOne }
      if (base === 'holding_events') return { insertOne: eventsInsertOne }
      throw new Error(`unexpected collection ${base}`)
    }),
  }
})

const { applyHoldingAction } = await import('./holdings')

const auth = { userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const }

describe('applyHoldingAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    holdingsUpdateOne.mockResolvedValue({ matchedCount: 1 })
  })

  it('returns a 404 result when the holding does not exist', async () => {
    holdingsFindOne.mockResolvedValueOnce(null)
    const result = await applyHoldingAction(auth, { name: 'Stocks', action: 'contribution', amount: 100 })
    expect(result).toEqual({ ok: false, error: 'holding not found', status: 404 })
  })

  it('contribution adds to the holding value and never touches budgets', async () => {
    holdingsFindOne.mockResolvedValueOnce({ _id: 'h1', name: 'Stocks', value: '1000' })

    const result = await applyHoldingAction(auth, { name: 'Stocks', action: 'contribution', amount: 200 })

    expect(result).toEqual({ ok: true, previousValue: 1000, newValue: 1200 })
    // Filtered on _id, not the (encrypted) value field — a concurrent writer
    // on the same document is caught by the transaction's own conflict
    // detection. The unencrypted revision still advances for stale editors.
    expect(holdingsUpdateOne).toHaveBeenCalledWith(
      { _id: 'h1' },
      { $set: expect.objectContaining({ value: '1200' }), $inc: { version: 1 } },
      { session: undefined },
    )
    expect(budgetsFindOne).not.toHaveBeenCalled()
    expect(eventsInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'contribution', previous_value: '1000', new_value: '1200' }),
      { session: undefined },
    )
  })

  it('withdrawal subtracts from the holding value, floored at 0, and never touches budgets', async () => {
    holdingsFindOne.mockResolvedValueOnce({ _id: 'h1', name: 'Stocks', value: '150' })

    const result = await applyHoldingAction(auth, { name: 'Stocks', action: 'withdrawal', amount: 500 })

    expect(result).toEqual({ ok: true, previousValue: 150, newValue: 0 })
    expect(budgetsFindOne).not.toHaveBeenCalled()
  })

  it('market_update replaces the value outright and never touches budgets', async () => {
    holdingsFindOne.mockResolvedValueOnce({ _id: 'h1', name: 'Stocks', value: '1000' })

    const result = await applyHoldingAction(auth, { name: 'Stocks', action: 'market_update', amount: 1350 })

    expect(result).toEqual({ ok: true, previousValue: 1000, newValue: 1350 })
    expect(budgetsFindOne).not.toHaveBeenCalled()
  })
})
