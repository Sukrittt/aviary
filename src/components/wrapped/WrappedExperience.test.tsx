import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { WrappedExperience, wrappedArchetype } from './WrappedExperience'
import type { WrappedData } from '@/src/api/wrapped'

const { track, wrappedData } = vi.hoisted(() => ({ track: vi.fn(), wrappedData: { current: null as unknown } }))
vi.mock('@/src/lib/analytics', () => ({ track }))
vi.mock('@/src/hooks/useWrapped', () => ({
  useWrapped: () => ({ data: wrappedData.current, isLoading: false, isError: false }),
  useWrappedJudgement: () => ({ data: {} }),
}))
vi.mock('@/src/hooks/useBudgets', () => ({ useBudgets: () => ({ data: [] }) }))
vi.mock('@/src/hooks/useHideAmounts', () => ({ useHideAmounts: () => [false] }))
vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ formatCurrency: (n: number) => `₹${n}` }) }))

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

it('ends Wrapped with a way into planning this month', async () => {
  wrappedData.current = recap()
  render(<WrappedExperience />)
  fireEvent.click(screen.getByRole('button', { name: /Unwrap my month/ }))
  const next = screen.getByRole('button', { name: 'Next story' })
  while (!next.hasAttribute('disabled')) fireEvent.click(next)
  const plan = await screen.findByRole('link', { name: 'Plan this month' })
  expect(plan).toHaveAttribute('href', '/expense')
  expect(screen.getByRole('button', { name: /Share my Wrapped/ })).toBeInTheDocument()
  fireEvent.click(plan)
  expect(track).toHaveBeenCalledWith('wrapped_plan_tapped')
})
