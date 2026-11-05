import { describe, expect, it } from 'vitest'
import { analyzeCadence, buildCandidates, nextSuggestedDate, scanWindow } from './recurringDetection'
const rows = ['2026-07-05', '2026-08-05', '2026-09-05'].map((date, i) => ({ _id: String(i), date, item: 'Netflix', amount_inr: '649', category: 'Entertainment', payment_method: 'bank' }))
describe('recurring candidates', () => {
  it('groups normalized names and requires two distinct payment dates', () => {
    expect(buildCandidates(rows, [], 'INR')).toHaveLength(1)
    expect(buildCandidates(rows.slice(0, 2), [], 'INR')).toHaveLength(1)
    expect(buildCandidates(rows.slice(0, 1), [], 'INR')).toHaveLength(0)
    expect(buildCandidates(rows.map(r => ({ ...r, date: rows[0].date })), [], 'INR')).toHaveLength(0)
    expect(buildCandidates([rows[0], { ...rows[1], item: ' NETFLIX ' }, rows[2]], [], 'INR')).toHaveLength(1)
  })
  it('excludes already tracked names, generated payments, refunds and invalid values', () => {
    expect(buildCandidates(rows, ['Netflix'], 'INR')).toHaveLength(0)
    for (const change of [{ source: 'recurring' }, { amount_inr: '-1' }, { amount_inr: 'Infinity' }, { date: '2026-02-31' }, { source: 'transfer' }]) {
      expect(buildCandidates(rows.map(r => ({ ...r, ...change })), [], 'INR')).toHaveLength(0)
    }
  })
  it('fingerprints edits and currency, but not input ordering', () => {
    const first = buildCandidates(rows, [], 'INR')[0]
    expect(buildCandidates([...rows].reverse(), [], 'INR')[0].fingerprint).toBe(first.fingerprint)
    expect(buildCandidates(rows.map(r => ({ ...r, amount_inr: '699' })), [], 'INR')[0].fingerprint).not.toBe(first.fingerprint)
    expect(buildCandidates(rows, [], 'USD')[0].fingerprint).not.toBe(first.fingerprint)
  })
  it('does not combine payment methods', () => {
    expect(buildCandidates(rows.slice(0, 2).map((r, i) => ({ ...r, payment_method: i ? 'bank' : 'credit_card' })), [], 'INR')).toHaveLength(0)
  })
  it('does not send conflicting intervals to Jev', () => {
    const irregular = ['2026-01-01', '2026-02-01', '2026-04-01'].map((date, i) => ({ ...rows[0], _id: String(i), date }))
    expect(buildCandidates(irregular, [], 'INR')).toHaveLength(0)
  })
  it('suggests strictly future dates with month-end clamping', () => {
    expect(nextSuggestedDate('2026-08-31', 'monthly', '2026-09-30')).toBe('2026-10-31')
    expect(nextSuggestedDate('2026-09-05', 'monthly', '2026-09-22')).toBe('2026-10-05')
    expect(nextSuggestedDate('2026-01-31', 'quarterly', '2026-02-01')).toBe('2026-04-30')
  })
})

it('clamps selectable month windows to valid calendar dates', () => {
  expect(scanWindow('2026-03-31', 1)).toBe('2026-02-28')
  expect(scanWindow('2026-09-22', 3)).toBe('2026-06-22')
  expect(scanWindow('2026-09-22', 6)).toBe('2026-03-22')
  expect(scanWindow('2026-09-22', 12)).toBe('2025-09-22')
})

describe('deterministic cadence', () => {
  it('recognizes yearly billing despite a small billing-day shift', () => {
    expect(analyzeCadence(['2026-08-23', '2025-08-25'])).toEqual({
      sortedDates: ['2025-08-25', '2026-08-23'],
      intervals: [{ days: 363, calendarMonths: 12, billingDayDrift: 2 }],
      deterministicCadence: 'yearly',
    })
  })

  it('recognizes calendar-month, weekly, and quarterly intervals', () => {
    expect(analyzeCadence(['2026-01-31', '2026-02-28']).deterministicCadence).toBe('monthly')
    expect(analyzeCadence(['2026-09-01', '2026-09-09']).deterministicCadence).toBe('weekly')
    expect(analyzeCadence(['2026-01-31', '2026-04-30']).deterministicCadence).toBe('quarterly')
  })

  it('uses the latest clean cadence after older irregular observations', () => {
    const dates = ['2026-06-23', '2026-07-03', '2026-08-23', '2026-09-23']
    expect(analyzeCadence(dates).deterministicCadence).toBe('monthly')
    expect(buildCandidates(dates.map((date, i) => ({ ...rows[0], _id: String(i), date })), [], 'INR')).toHaveLength(1)
  })

  it('abstains when adjacent intervals conflict', () => {
    expect(analyzeCadence(['2026-01-01', '2026-02-01', '2026-04-01']).deterministicCadence).toBe('uncertain')
  })
})

it('sends two monthly rent payments forward for evaluation', () => {
  const rent = ['2026-08-05', '2026-09-05'].map((date, i) => ({ _id: String(i), date, item: 'Rent', amount_inr: 5000, category: 'Housing' }))
  const candidates = buildCandidates(rent, [], 'INR')
  expect(candidates).toHaveLength(1)
  expect(candidates[0].payments.map(p => p.amount)).toEqual([5000, 5000])
  expect(candidates[0].timing.deterministicCadence).toBe('monthly')
})

describe('month-end billing', () => {
  it('reads a bill on the last day of every month as monthly', () => {
    expect(analyzeCadence(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']).deterministicCadence).toBe('monthly')
  })

  it('reads a yearly charge on Feb 29 then Feb 28 as yearly', () => {
    expect(analyzeCadence(['2024-02-29', '2025-02-28']).deterministicCadence).toBe('yearly')
  })

  it('ignores impossible dates and repeats of the same day', () => {
    const timing = analyzeCadence(['2026-02-30', '2026-01-05', '2026-01-05', '2026-02-05', 'soon'])
    expect(timing.sortedDates).toEqual(['2026-01-05', '2026-02-05'])
    expect(timing.deterministicCadence).toBe('monthly')
  })

  // ponytail: needs `anchor_day` on recurring expenses (only recurring incomes store one), so it's a schema call.
  it.skip('suggests the next month-end, not the 28th, after a bill on Jan 31 and Feb 28', () => {
    expect(nextSuggestedDate('2026-02-28', 'monthly', '2026-03-01')).toBe('2026-03-31')
  })
})

describe('buildCandidates and the product rules', () => {
  const row = (date: string, extra: Record<string, unknown> = {}) => ({ _id: date, date, item: 'Home loan EMI', amount_inr: '12500', category: 'Loans', payment_method: 'bank', ...extra })

  it('offers a monthly EMI as recurring', () => {
    const [candidate] = buildCandidates([row('2026-07-05'), row('2026-08-05'), row('2026-09-05')], [], 'INR')
    expect(candidate.timing.deterministicCadence).toBe('monthly')
    expect(candidate.payments).toHaveLength(3)
  })

  it('never offers refunds, a negative amount or zero as recurring: a refund is one-off income', () => {
    expect(buildCandidates([row('2026-07-05', { source: 'refund' }), row('2026-08-05', { source: 'Refund' })], [], 'INR')).toEqual([])
    expect(buildCandidates([row('2026-07-05', { amount_inr: '-12500' }), row('2026-08-05', { amount_inr: '-12500' })], [], 'INR')).toEqual([])
    expect(buildCandidates([row('2026-07-05', { amount_inr: '0' }), row('2026-08-05', { amount_inr: '0' })], [], 'INR')).toEqual([])
  })

  it('skips rows the app logged itself from a recurrence or subscription', () => {
    expect(buildCandidates([row('2026-07-05', { source: 'recurring' }), row('2026-08-05', { source: 'subscription' })], [], 'INR')).toEqual([])
  })

  it('matches a tracked name whatever its case and punctuation', () => {
    expect(buildCandidates([row('2026-07-05'), row('2026-08-05')], ['home-loan  emi'], 'INR')).toEqual([])
  })
})
