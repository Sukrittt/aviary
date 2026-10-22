import { describe, it, expect } from 'vitest'
import { runOutWarning, nextMonthLine, aboutAmount } from './forecastCopy'
import { formatMoney } from './currencies'
import type { Forecast, ForecastEnvelope } from '@/lib/forecast'

const money = (n: number) => formatMoney(n, 'INR')
const env = (over: Partial<ForecastEnvelope>): ForecastEnvelope => ({
  category: 'Food', available: 0, scheduled: 0, usualDaily: 0, projected: 0, runsOutOn: null, overspent: false, ...over,
})
const f = (over: Partial<Forecast>): Forecast => ({
  basis: 'history', daysLeft: 12, totalLeft: 0, envelopes: [],
  nextMonth: { month: '2026-11', income: 0, spokenFor: 0, free: 0 }, ...over,
})

describe('aboutAmount', () => {
  it('rounds to a friendly figure', () => {
    expect(aboutAmount(2387.45)).toBe(2400)
    expect(aboutAmount(987)).toBe(990)
    expect(aboutAmount(-1234)).toBe(-1200)
  })
})

describe('runOutWarning', () => {
  it('names the first envelope to run out, without its emoji', () => {
    const envelopes = [env({ category: '🍔 Food', runsOutOn: '2026-10-26' }), env({ category: 'Fun', runsOutOn: '2026-10-24' })]
    expect(runOutWarning(f({ totalLeft: 5000, envelopes }))?.text).toBe('Fun runs out around 24\u00a0Oct')
  })

  it('stays quiet when nothing runs out', () => {
    expect(runOutWarning(f({ totalLeft: 2387, envelopes: [env({})] }))).toBeNull()
    expect(runOutWarning(f({ totalLeft: -1180 }))).toBeNull()
    expect(runOutWarning(f({ basis: null, totalLeft: null }))).toBeNull()
  })

  it('keys the dismissal to the envelope and date, the same as Mobile', () => {
    const at = (category: string, runsOutOn: string) => runOutWarning(f({ envelopes: [env({ category, runsOutOn })] }))!.key
    const key = at('🍔 Food & Drinks', '2026-10-26')
    expect(key).toMatch(/^[A-Za-z0-9._-]+$/)
    expect(at('🍔 Food & Drinks', '2026-10-26')).toBe(key)
    expect(at('🍔 Food & Drinks', '2026-10-27')).not.toBe(key)
    expect(at('Fun', '2026-10-26')).not.toBe(key)
    expect(at('Aa', '2026-10-26')).not.toBe(at('BB', '2026-10-26'))
  })
})

describe('nextMonthLine', () => {
  it('says what is spoken for, and what that leaves', () => {
    expect(nextMonthLine({ month: '2026-11', income: 80000, spokenFor: 27919, free: 52081 }, money)).toEqual({
      title: '₹27,919 is already spoken for next month',
      detail: 'That leaves ₹52,081 of your ₹80,000 income.',
    })
  })

  it('skips the income half with no recurring income', () => {
    expect(nextMonthLine({ month: '2026-11', income: 0, spokenFor: 500, free: -500 }, money)).toEqual({
      title: '₹500 is already spoken for next month',
      detail: null,
    })
  })

  it('says when bills come to more than the income', () => {
    expect(nextMonthLine({ month: '2026-11', income: 1000, spokenFor: 1500, free: -500 }, money)?.detail).toBe(
      "That's ₹500 more than your ₹1,000 income.",
    )
  })

  it('says nothing when nothing is scheduled', () => {
    expect(nextMonthLine({ month: '2026-11', income: 80000, spokenFor: 0, free: 80000 }, money)).toBeNull()
  })
})
