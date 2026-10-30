import { describe, it, expect, vi, beforeEach } from 'vitest'

let docs: Array<Record<string, string>> = []
let budgetDocs: Array<Record<string, string>> = []
const findMock = vi.fn(() => ({ toArray: async () => docs }))
vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async (name: string) =>
      name === 'budgets' ? { find: () => ({ toArray: async () => budgetDocs }) } : { find: findMock },
    ),
  }
})
vi.mock('@/lib/cache', () => ({ cachedRead: (_b: string, _u: string, fn: () => Promise<unknown>) => fn() }))
let carried: Record<string, Record<string, number>> = {}
vi.mock('@/lib/budgetCarry', () => ({
  computeCarry: async (_auth: unknown, month: string) => ({ month, ready_to_assign: 0, rolled_over: carried[month] ?? {} }),
}))

const { currentEdition, monthRange, editionStatus, readWrapped, WRAPPED_MIN_TRANSACTIONS } = await import('./wrapped')

function row(amountInr: number) {
  return { amount_inr: String(amountInr) }
}

beforeEach(() => {
  docs = []
  budgetDocs = []
})

describe('currentEdition', () => {
  it('returns the previous month within a year', () => {
    expect(currentEdition('2026-09-15')).toBe('2026-08')
  })

  it('wraps across a year boundary', () => {
    expect(currentEdition('2026-01-10')).toBe('2025-12')
  })
})

describe('monthRange', () => {
  it('spans the full month, 31 days', () => {
    expect(monthRange('2026-08')).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  })

  it('spans the full month, 30 days', () => {
    expect(monthRange('2026-09')).toEqual({ start: '2026-09-01', end: '2026-09-30' })
  })

  it('handles February in a leap year', () => {
    expect(monthRange('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })

  it('handles February in a non-leap year', () => {
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
})

const AUTH = { userId: 'u1', readOnly: false, sessionId: null, spaceId: 'u1', spaceOwnerId: 'u1', spaceRole: 'owner' as const }

describe('editionStatus', () => {
  it('a card payment does not count toward unlocking it', async () => {
    docs = [...Array.from({ length: WRAPPED_MIN_TRANSACTIONS - 1 }, () => row(100)), { ...row(100), category: '__credit_card__' }]
    const status = await editionStatus(AUTH, '2026-08')
    expect(status.transactionCount).toBe(WRAPPED_MIN_TRANSACTIONS - 1)
    expect(status.available).toBe(false)
  })

  it('is unavailable one below the threshold', async () => {
    docs = Array.from({ length: WRAPPED_MIN_TRANSACTIONS - 1 }, () => row(100))
    const status = await editionStatus(AUTH, '2026-08')
    expect(status.available).toBe(false)
    expect(status.transactionCount).toBe(WRAPPED_MIN_TRANSACTIONS - 1)
  })

  it('is available exactly at the threshold', async () => {
    docs = Array.from({ length: WRAPPED_MIN_TRANSACTIONS }, () => row(100))
    const status = await editionStatus(AUTH, '2026-08')
    expect(status.available).toBe(true)
  })

  it('excludes zero/negative rows (refunds) from the count', async () => {
    docs = [...Array.from({ length: WRAPPED_MIN_TRANSACTIONS }, () => row(100)), row(0), row(-50)]
    const status = await editionStatus(AUTH, '2026-08')
    expect(status.transactionCount).toBe(WRAPPED_MIN_TRANSACTIONS)
  })

  it('queries the collection scoped to the month range', async () => {
    docs = []
    await editionStatus(AUTH, '2026-08')
    expect(findMock).toHaveBeenCalledWith({ date: { $gte: '2026-08-01', $lte: '2026-08-31' } })
  })
})

describe('readWrapped', () => {
  const auth = { userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const } as Parameters<typeof readWrapped>[0]
  const expense = (date: string, amount: number) => ({ date, timestamp: `${date}T12:00:00`, item: 'Lunch', amount_inr: String(amount), category: 'Food', source: 'manual' })

  it('sends the deck and last month, never the internal facts', async () => {
    docs = [expense('2026-08-03', 1000), expense('2026-09-03', 400)]
    const res = await readWrapped(auth, '2026-09')
    expect(res).not.toHaveProperty('facts')
    expect(res.stories.map((s) => s.type)).toContain('up_or_down')
    expect(res.previous).toEqual({ month: '2026-08', totalSpent: 1000, daysLogged: 1, longestStreak: 1, topCategories: [{ category: 'Food', total: 1000 }] })
  })

  it('counts rolled-over money in an envelope and skips the credit card and income rows', async () => {
    docs = [expense('2026-09-03', 400)]
    budgetDocs = [
      { month: '2026-09', category: 'Food', assigned: '600', rolled_over: '0' },
      { month: '2026-09', category: '__credit_card__', assigned: '5000', rolled_over: '0' },
      { month: '2026-09', category: '__income__', assigned: '9000', rolled_over: '0' },
      { month: '2026-09', category: '__Travel', assigned: '500', rolled_over: '0' },
      { month: '2026-08', category: 'Food', assigned: '99999', rolled_over: '0' },
    ]
    // Rolled-over money is computed (lib/budgetCarry.ts), never read off the stored row.
    carried = { '2026-09': { Food: 400 } }
    const stayed = (await readWrapped(auth, '2026-09')).stories.find((s) => s.type === 'stayed_put')
    expect(stayed?.facts).toEqual({ left: 1100, assigned: 1500 })
  })

  it('has no previous month when last month was empty', async () => {
    docs = [expense('2026-09-03', 400)]
    expect((await readWrapped(auth, '2026-09')).previous).toBeNull()
  })
})
