import { describe, it, expect } from 'vitest'
import { paceOutlier, type PaceExpense } from './pace'

const e = (date: string, amount: number, category = 'Food'): PaceExpense => ({ date, amount_inr: amount, category })

/** A steady user: 1,000 of Food and 3,000 of Rent in each of Jun, Jul, Aug, logged on the 5th and 20th. */
function steadyHistory(): PaceExpense[] {
  return ['2026-06', '2026-07', '2026-08'].flatMap((m) => [
    e(`${m}-05`, 500), e(`${m}-20`, 500),
    e(`${m}-01`, 3000, 'Rent'),
  ])
}

describe('paceOutlier', () => {
  it('flags a category spending over twice its usual month-to-date', () => {
    const result = paceOutlier([...steadyHistory(), e('2026-09-03', 1200), e('2026-09-01', 3000, 'Rent')], '2026-09-12')
    // Usual by the 12th: only the 5th's 500 in each prior month.
    expect(result).toEqual({ category: 'Food', spent: 1200, usual: 500, usualRest: 500, ratio: 2.4 })
  })

  it('stays quiet when spend is under twice the usual pace', () => {
    expect(paceOutlier([...steadyHistory(), e('2026-09-03', 900)], '2026-09-12')).toBeNull()
  })

  it('waits until the 7th so one early purchase cannot look like a trend', () => {
    expect(paceOutlier([...steadyHistory(), e('2026-09-02', 5000)], '2026-09-06')).toBeNull()
  })

  it('needs the category in at least 2 of the 3 prior months', () => {
    const history = [...steadyHistory(), e('2026-08-02', 100, 'Gifts')]
    expect(paceOutlier([...history, e('2026-09-03', 2000, 'Gifts')], '2026-09-12')).toBeNull()
  })

  it('averages over months the user actually has, not a fixed 3', () => {
    // Account started in July: two months of history, each with 500 by the 12th.
    const history = ['2026-07', '2026-08'].flatMap((m) => [e(`${m}-05`, 500), e(`${m}-01`, 3000, 'Rent')])
    const result = paceOutlier([...history, e('2026-09-03', 1000)], '2026-09-12')
    expect(result).toMatchObject({ category: 'Food', usual: 500, ratio: 2 })
  })

  it('ignores tiny categories under 5% of usual monthly spend', () => {
    const history = [...steadyHistory(), ...['2026-06', '2026-07', '2026-08'].map((m) => e(`${m}-02`, 50, 'Stamps'))]
    expect(paceOutlier([...history, e('2026-09-03', 400, 'Stamps')], '2026-09-12')).toBeNull()
  })

  it('picks the category with the biggest money overshoot, not the biggest ratio', () => {
    const history = [...steadyHistory(), ...['2026-06', '2026-07', '2026-08'].map((m) => e(`${m}-02`, 300, 'Fuel'))]
    const result = paceOutlier([
      ...history,
      e('2026-09-03', 1500), // Food: 3x, 1,000 over
      e('2026-09-03', 1200, 'Fuel'), // Fuel: 4x, 900 over
    ], '2026-09-12')
    expect(result?.category).toBe('Food')
  })

  it('skips income and credit card sentinels and future-dated rows', () => {
    const history = [...steadyHistory(), ...['2026-06', '2026-07', '2026-08'].map((m) => e(`${m}-02`, 2000, '__income__'))]
    expect(paceOutlier([...history, e('2026-09-03', 9000, '__income__'), e('2026-09-25', 5000)], '2026-09-12')).toBeNull()
  })
})
