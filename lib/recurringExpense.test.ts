import { describe, it, expect } from 'vitest'
import { advance, occurrencesDue, isExpired, firstRunOnOrAfter, paymentMethodOf, MAX_BACKFILL } from './recurringExpense'

const base = {
  frequency: 'monthly',
  start_date: '2026-01-15',
  end_date: '',
  next_run_date: '2026-01-15',
  status: 'active',
}

describe('advance', () => {
  it('advances one day / week / month / year', () => {
    expect(advance('2026-09-07', 'daily')).toBe('2026-09-08')
    expect(advance('2026-09-07', 'weekly')).toBe('2026-09-14')
    expect(advance('2026-09-07', 'monthly')).toBe('2026-10-07')
    expect(advance('2026-09-07', 'yearly')).toBe('2027-09-07')
  })

  it('rolls across month and year boundaries', () => {
    expect(advance('2026-08-31', 'daily')).toBe('2026-09-01')
    expect(advance('2026-12-28', 'weekly')).toBe('2027-01-04')
    expect(advance('2026-12-15', 'monthly')).toBe('2027-01-15')
  })

  it('clamps a monthly 31st into a shorter month instead of overflowing', () => {
    // `subscriptions.ts::rollForward` would give 2026-03-03 here.
    expect(advance('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(advance('2026-03-31', 'monthly')).toBe('2026-04-30')
  })

  it('does not drift once clamped, when given the anchor day', () => {
    // Feb 28 + monthly must return to the 31st, not stay on the 28th.
    expect(advance('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
    expect(advance('2026-04-30', 'monthly', 31)).toBe('2026-05-31')
  })

  it('clamps a yearly Feb 29 into a non-leap year', () => {
    expect(advance('2028-02-29', 'yearly')).toBe('2029-02-28')
    expect(advance('2029-02-28', 'yearly', 29)).toBe('2030-02-28')
    expect(advance('2031-02-28', 'yearly', 29)).toBe('2032-02-29')
  })

  it('returns the input unchanged for an unknown frequency', () => {
    expect(advance('2026-09-07', 'fortnightly')).toBe('2026-09-07')
  })
})

describe('occurrencesDue', () => {
  it('returns the single occurrence due exactly today', () => {
    expect(occurrencesDue({ ...base, next_run_date: '2026-09-15' }, '2026-09-15')).toEqual(['2026-09-15'])
  })

  it('returns nothing when the next run is still in the future', () => {
    expect(occurrencesDue({ ...base, next_run_date: '2026-09-16' }, '2026-09-15')).toEqual([])
  })

  it('backfills every missed occurrence, each on its own date', () => {
    const weekly = { ...base, frequency: 'weekly', start_date: '2026-08-18', next_run_date: '2026-08-18' }
    expect(occurrencesDue(weekly, '2026-09-07')).toEqual(['2026-08-18', '2026-08-25', '2026-09-01'])
  })

  it('backfills monthly without drifting off a clamped month-end', () => {
    const monthly = { ...base, start_date: '2026-01-31', next_run_date: '2026-01-31' }
    expect(occurrencesDue(monthly, '2026-04-01')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('includes an occurrence landing exactly on end_date and stops after it', () => {
    const ending = { ...base, frequency: 'weekly', start_date: '2026-09-01', next_run_date: '2026-09-01', end_date: '2026-09-08' }
    expect(occurrencesDue(ending, '2026-09-30')).toEqual(['2026-09-01', '2026-09-08'])
  })

  it('returns nothing once end_date has passed', () => {
    expect(occurrencesDue({ ...base, next_run_date: '2026-09-15', end_date: '2026-09-14' }, '2026-09-20')).toEqual([])
  })

  it('returns nothing for a paused or ended recurrence', () => {
    expect(occurrencesDue({ ...base, next_run_date: '2026-09-15', status: 'paused' }, '2026-09-15')).toEqual([])
    expect(occurrencesDue({ ...base, next_run_date: '2026-09-15', status: 'ended' }, '2026-09-15')).toEqual([])
  })

  it('returns nothing when next_run_date is missing or unparseable', () => {
    expect(occurrencesDue({ ...base, next_run_date: '' }, '2026-09-15')).toEqual([])
    expect(occurrencesDue({ ...base, next_run_date: 'not-a-date' }, '2026-09-15')).toEqual([])
  })

  it('caps a runaway backfill instead of spinning', () => {
    const daily = { ...base, frequency: 'daily', start_date: '2019-01-01', next_run_date: '2019-01-01' }
    const due = occurrencesDue(daily, '2026-09-07')
    expect(due).toHaveLength(MAX_BACKFILL)
    expect(due[0]).toBe('2019-01-01')
  })
})

describe('isExpired', () => {
  it('is true only once end_date is strictly in the past', () => {
    expect(isExpired({ ...base, end_date: '2026-09-06' }, '2026-09-07')).toBe(true)
    expect(isExpired({ ...base, end_date: '2026-09-07' }, '2026-09-07')).toBe(false)
    expect(isExpired({ ...base, end_date: '2026-09-08' }, '2026-09-07')).toBe(false)
  })

  it('is false when there is no end_date', () => {
    expect(isExpired(base, '2030-01-01')).toBe(false)
  })
})

describe('firstRunOnOrAfter', () => {
  it('keeps a future start date as-is', () => {
    expect(firstRunOnOrAfter('2026-09-20', 'monthly', '2026-09-07')).toBe('2026-09-20')
  })

  it('keeps a start date of exactly today', () => {
    expect(firstRunOnOrAfter('2026-09-07', 'monthly', '2026-09-07')).toBe('2026-09-07')
  })

  it('walks a backdated start forward so creating a recurrence never backfills history', () => {
    expect(firstRunOnOrAfter('2026-01-15', 'monthly', '2026-09-07')).toBe('2026-09-15')
    expect(firstRunOnOrAfter('2026-08-18', 'weekly', '2026-09-07')).toBe('2026-09-08')
  })
})

describe('month-end and leap-year schedules', () => {
  it('walks a backdated 31st start to the next month-end, clamping only the short month', () => {
    expect(firstRunOnOrAfter('2026-01-31', 'monthly', '2026-02-27')).toBe('2026-02-28')
    expect(firstRunOnOrAfter('2026-01-31', 'monthly', '2026-03-15')).toBe('2026-03-31')
  })

  it('a stored anchor_day beats a start date that had to clamp (a 31st starting in November)', () => {
    expect(occurrencesDue({ ...base, start_date: '2026-11-30', next_run_date: '2026-11-30', anchor_day: 31 }, '2027-03-01'))
      .toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'])
  })

  it('a yearly Feb 29 lands on Feb 28 in common years and back on the 29th in the next leap year', () => {
    const due = occurrencesDue({ ...base, frequency: 'yearly', start_date: '2024-02-29', next_run_date: '2024-02-29' }, '2028-03-01')
    expect(due).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29'])
  })

  it('a weekly run crosses a year boundary on the right weekday', () => {
    expect(occurrencesDue({ ...base, frequency: 'weekly', start_date: '2026-12-24', next_run_date: '2026-12-24' }, '2027-01-08'))
      .toEqual(['2026-12-24', '2026-12-31', '2027-01-07'])
  })

  it('a daily run counts Feb 29 in a leap year', () => {
    expect(occurrencesDue({ ...base, frequency: 'daily', start_date: '2028-02-28', next_run_date: '2028-02-28' }, '2028-03-01'))
      .toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
  })

  it('stops the backfill at end_date even when today is long past it', () => {
    expect(occurrencesDue({ ...base, next_run_date: '2026-01-15', end_date: '2026-03-20' }, '2026-12-01'))
      .toEqual(['2026-01-15', '2026-02-15', '2026-03-15'])
  })

  it('a quarterly 31st clamps without drifting', () => {
    expect(occurrencesDue({ ...base, frequency: 'quarterly', start_date: '2026-01-31', next_run_date: '2026-01-31' }, '2026-12-31'))
      .toEqual(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31'])
  })
})

describe('paymentMethodOf', () => {
  it('reads every spelling of credit card as the card, so an EMI on a card still fills the card envelope', () => {
    for (const v of ['credit_card', 'Credit Card', 'credit-card', 'CREDIT CARD', ' creditcard ']) expect(paymentMethodOf(v)).toBe('credit_card')
  })

  it('reads anything else, missing included, as bank rather than failing the run', () => {
    for (const v of ['bank', 'Debit Card', 'Bank Transfer', 'card', '', null, undefined, 42]) expect(paymentMethodOf(v)).toBe('bank')
  })
})
