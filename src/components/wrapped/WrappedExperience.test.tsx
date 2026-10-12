import { describe, expect, it } from 'vitest'
import { wrappedArchetype } from './WrappedExperience'
import type { WrappedData } from '@/src/api/wrapped'

function recap(overrides: Partial<WrappedData> = {}): WrappedData {
  return {
    month: '2026-08',
    range: { startDate: '2026-08-01', endDate: '2026-08-28', daysTracked: 8 },
    totalSpent: 1000,
    totalTransactions: 12,
    topCategories: [{ category: 'Food', total: 400, pct: 40 }],
    biggestPurchase: null,
    topWeekday: null,
    longestStreak: { days: 3, startDate: '2026-08-01', endDate: '2026-08-03' },
    longestGap: null,
    weeklyTotals: [
      { label: '1-7', total: 250 },
      { label: '8-14', total: 250 },
      { label: '15-21', total: 250 },
      { label: '22-end', total: 250 },
    ],
    ...overrides,
  }
}

describe('wrappedArchetype', () => {
  it('prefers Jev\'s persona over the local rules', () => {
    const data = recap({ longestStreak: { days: 8, startDate: '2026-08-01', endDate: '2026-08-08' } })
    expect(wrappedArchetype(data, { persona: 'big_swing' }).name).toBe('The Big Swing')
  })

  it('falls back to the local rules for an unknown or missing persona', () => {
    expect(wrappedArchetype(recap(), { persona: 'nonsense' }).name).toBe('The Steady Hand')
    expect(wrappedArchetype(recap()).name).toBe('The Steady Hand')
  })

  it('prioritises a seven-day logging streak', () => {
    expect(wrappedArchetype(recap({ longestStreak: { days: 8, startDate: '2026-08-01', endDate: '2026-08-08' } })).name)
      .toBe('The Daily Tracker')
  })

  it('recognises a dominant spending category', () => {
    expect(wrappedArchetype(recap({ topCategories: [{ category: 'Travel', total: 600, pct: 60 }] })).name)
      .toBe('The Loyalist')
  })

  it('recognises evenly distributed weeks', () => {
    expect(wrappedArchetype(recap()).name).toBe('The Steady Hand')
  })

  it('falls back to a varied-spending archetype', () => {
    expect(wrappedArchetype(recap({ weeklyTotals: [
      { label: '1-7', total: 800 },
      { label: '8-14', total: 100 },
      { label: '15-21', total: 50 },
      { label: '22-end', total: 50 },
    ] })).name).toBe('The Free Spirit')
  })
})
