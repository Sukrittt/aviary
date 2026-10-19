import { describe, it, expect } from 'vitest'
import { forecastHeadline, nextMonthLine, aboutAmount } from './forecastCopy'
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

describe('forecastHeadline', () => {
  it('says what is left at month end', () => {
    expect(forecastHeadline(f({ totalLeft: 2387 }), money)).toBe('About ₹2,400 left at month end')
  })

  it('names the first envelope to run out, without its emoji', () => {
    const envelopes = [env({ category: '🍔 Food', runsOutOn: '2026-10-26' }), env({ category: 'Fun', runsOutOn: '2026-10-24' })]
    expect(forecastHeadline(f({ totalLeft: 5000, envelopes }), money)).toBe('Fun runs out around 24 Oct')
  })

  it('says how far over the month ends up, calmly', () => {
    expect(forecastHeadline(f({ totalLeft: -1180 }), money)).toBe('About ₹1,200 over by month end')
  })

  it('says nothing without a forecast', () => {
    expect(forecastHeadline(f({ basis: null, totalLeft: null }), money)).toBeNull()
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
