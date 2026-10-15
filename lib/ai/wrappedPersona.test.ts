import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeWrapped, type WrappedData } from '@/src/services/wrappedAdapter'

const runJev = vi.fn()
vi.mock('./jev', () => ({ runJev: (...args: unknown[]) => runJev(...(args as [])) }))

const { judgeWrapped } = await import('./wrappedPersona')
const caller = { userId: 'user_1', feature: 'wrapped' as const }

function recap(overrides: Partial<WrappedData> = {}): WrappedData {
  return {
    month: '2026-08',
    range: { startDate: '2026-08-01', endDate: '2026-08-28', daysTracked: 12 },
    totalSpent: 1000,
    totalTransactions: 20,
    topCategories: [
      { category: 'Food', total: 400, pct: 40 },
      { category: 'Rent', total: 600, pct: 60 },
    ],
    biggestPurchase: { item: 'Laptop', amountInr: 500, category: 'Tech', date: '2026-08-10' },
    topWeekday: { day: 'Friday', total: 300, count: 5 },
    longestStreak: { days: 4, startDate: '2026-08-01', endDate: '2026-08-04' },
    longestGap: { days: 3, startDate: '2026-08-05', endDate: '2026-08-08' },
    weeklyTotals: [
      { label: '1-7', total: 250 },
      { label: '8-14', total: 250 },
      { label: '15-21', total: 250 },
      { label: '22-end', total: 250 },
    ],
    facts: computeWrapped([], '2026-08').facts,
    ...overrides,
  }
}

function answers(persona: string, treat: string, personaP = 0.9, treatP = 0.9) {
  return {
    persona: { type: 'choice', choice: persona, probabilities: { [persona]: personaP } },
    treat: { type: 'choice', choice: treat, probabilities: { [treat]: treatP } },
  }
}

beforeEach(() => vi.clearAllMocks())

describe('judgeWrapped', () => {
  it('asks over the fixed personas and the user own categories', async () => {
    runJev.mockResolvedValue(answers('loyalist', 'Food'))
    const result = await judgeWrapped(recap(), caller)
    const questions = runJev.mock.calls[0][1]
    expect(Object.keys(questions.persona.criteria)).toContain('big_swing')
    expect(Object.keys(questions.treat.criteria)).toEqual(['Food', 'Rent', 'none of these'])
    expect(result).toEqual({ persona: 'loyalist', treatCategory: 'Food' })
  })

  it('drops a low-confidence persona and a low-confidence treat', async () => {
    runJev.mockResolvedValue(answers('loyalist', 'Food', 0.2, 0.4))
    expect(await judgeWrapped(recap(), caller)).toEqual({ persona: null, treatCategory: null })
  })

  it('drops a treat that is not one of the user categories', async () => {
    runJev.mockResolvedValue(answers('slow_burn', 'none of these'))
    expect(await judgeWrapped(recap(), caller)).toEqual({ persona: 'slow_burn', treatCategory: null })
  })

  it('returns nulls when Jev is unavailable, so the recap still renders', async () => {
    runJev.mockRejectedValue(new Error('gateway down'))
    expect(await judgeWrapped(recap(), caller)).toEqual({ persona: null, treatCategory: null })
  })

  it('does not call Jev for an empty month', async () => {
    await judgeWrapped(recap({ totalTransactions: 0 }), caller)
    expect(runJev).not.toHaveBeenCalled()
  })
})
