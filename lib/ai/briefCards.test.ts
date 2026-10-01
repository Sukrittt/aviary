import { describe, it, expect } from 'vitest'
import { buildBriefCandidates, selectTop } from './briefCards'
import type { SummarizeExpensesResult } from './expenseContext'

function ctx(over: Partial<SummarizeExpensesResult> = {}): SummarizeExpensesResult {
  return {
    facts: '',
    sections: { header: '', envelopes: '', trend: '', top10: '', subscriptions: '', investments: '', transactions: '' },
    highlights: {
      topItem: { item: 'Flight to Goa', amount: 7400, category: 'Travel', date: '2026-09-11' },
      riser: { category: 'Food', thisMonth: 6400, priorAverage: 4100 },
      pace: null,
      subscriptionMonthlyBurn: 1290,
      investmentTotal: 120000,
    },
    meta: {
      txnCountThisMonth: 24,
      totalSpent: 21000,
      totalAssigned: 30000,
      daysLeft: 7,
      daysElapsed: 23,
      totalDaysInMonth: 30,
    },
    envelopes: [
      { category: 'Food', group: 'Needs', assigned: 8000, spent: 6400, available: 1600, isOverspent: false },
      { category: 'Travel', group: 'Wants', assigned: 5000, spent: 7400, available: -2400, isOverspent: true },
      { category: 'Bills', group: 'Needs', assigned: 4000, spent: 900, available: 3100, isOverspent: false },
    ] as unknown as SummarizeExpensesResult['envelopes'],
    subscriptions: [],
    categories: [],
    ...over,
  }
}

describe('buildBriefCandidates', () => {
  it('builds cards straight from the numbers, never inventing one', () => {
    const { cards } = buildBriefCandidates(ctx(), 'INR')
    const byTitle = Object.fromEntries(cards.map((c) => [c.title, c]))

    expect(byTitle.Food.amount).toBe(6400)
    expect(byTitle.Travel.amount).toBe(2400) // overspend is reported as a positive figure
    expect(byTitle.Travel.tone).toBe('warn')
    expect(byTitle['Flight to Goa'].amount).toBe(7400)
    expect(byTitle.Subscriptions.amount).toBe(1290)
    expect(byTitle.Investments.amount).toBe(120000)
    expect(cards.every((c) => c.valueLabel === 'INR')).toBe(true)
    expect(cards.every((c) => Number.isFinite(c.amount))).toBe(true)
  })

  it('leaves out cards with nothing behind them', () => {
    const { cards } = buildBriefCandidates(
      ctx({
        highlights: { topItem: null, riser: null, pace: null, subscriptionMonthlyBurn: 0, investmentTotal: 0 },
        envelopes: [] as unknown as SummarizeExpensesResult['envelopes'],
      }),
      'INR',
    )
    expect(cards.map((c) => c.title)).not.toContain('Subscriptions')
    expect(cards.map((c) => c.title)).not.toContain('Investments')
  })

  it('flags the pace card as a warning only when spending is ahead of the assigned budget', () => {
    const ahead = buildBriefCandidates(ctx({ meta: { ...ctx().meta, totalSpent: 33000 } }), 'INR')
    const behind = buildBriefCandidates(ctx(), 'INR')
    expect(ahead.cards.find((c) => c.title === 'Left to spend')?.tone).toBe('warn')
    expect(behind.cards.find((c) => c.title === 'Left to spend')?.tone).toBe('mint')
  })

  it('offers more follow-up questions than the four the brief shows', () => {
    const { questions } = buildBriefCandidates(ctx(), 'INR')
    expect(questions.length).toBeGreaterThan(4)
    expect(new Set(questions).size).toBe(questions.length)
  })

  it('writes copy that passes the app voice rules', () => {
    const { cards, questions } = buildBriefCandidates(ctx(), 'INR')
    const copy = [...cards.flatMap((c) => [c.title, c.subtitle]), ...questions]
    expect(copy.some((line) => line.includes('—'))).toBe(false)
  })
})

describe('selectTop', () => {
  it('keeps the highest scores', () => {
    expect(selectTop(['a', 'b', 'c', 'd'], [0.1, 3, 2, 0.5], 2)).toEqual(['b', 'c'])
  })

  it('breaks ties on the candidate order, which is the priority order', () => {
    expect(selectTop(['a', 'b', 'c'], [1, 1, 1], 2)).toEqual(['a', 'b'])
  })

  it('falls back to the first n when no scores are supplied', () => {
    expect(selectTop(['a', 'b', 'c'], [], 2)).toEqual(['a', 'b'])
  })

  it('never returns more than it was given', () => {
    expect(selectTop(['a'], [1], 3)).toEqual(['a'])
  })
})
