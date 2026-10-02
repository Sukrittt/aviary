import { describe, it, expect } from 'vitest'
import { isDueToday, isDueTomorrow, tomorrowOf, nextContributionDate } from './holdingRecurrence'

const base = { is_recurring: 'true', recurring_day: '15', recurring_last_run: '2026-08' }

describe('nextContributionDate', () => {
  const holding = { ...base, recurring_day: '4', recurring_amount: '1000', recurring_last_run: '2026-09' }

  it('shows the upcoming date and keeps today until the contribution runs', () => {
    expect(nextContributionDate(holding, '2026-10-02')).toBe('2026-10-04')
    expect(nextContributionDate(holding, '2026-10-04')).toBe('2026-10-04')
  })

  it('advances after this month has run or its due date was missed', () => {
    expect(nextContributionDate({ ...holding, recurring_last_run: '2026-10' }, '2026-10-04')).toBe('2026-11-04')
    expect(nextContributionDate(holding, '2026-10-05')).toBe('2026-11-04')
  })

  it('clamps short months, handles leap years, and rolls into the next year', () => {
    expect(nextContributionDate({ ...holding, recurring_day: '31' }, '2026-02-01')).toBe('2026-02-28')
    expect(nextContributionDate({ ...holding, recurring_day: '31' }, '2028-02-01')).toBe('2028-02-29')
    expect(nextContributionDate(holding, '2026-12-05')).toBe('2027-01-04')
  })

  it('omits schedules that the cron cannot apply', () => {
    expect(nextContributionDate({ ...holding, is_recurring: 'false' }, '2026-10-02')).toBeNull()
    expect(nextContributionDate({ ...holding, recurring_amount: '0' }, '2026-10-02')).toBeNull()
    for (const recurring_day of ['', '0', '32', 'abc']) {
      expect(nextContributionDate({ ...holding, recurring_day }, '2026-10-02')).toBeNull()
    }
  })
})

describe('isDueToday', () => {
  it('fires when recurring_day matches today and this month has not run yet', () => {
    expect(isDueToday(base, '2026-09-15')).toBe(true)
  })

  it('does not fire on a different day of the month', () => {
    expect(isDueToday(base, '2026-09-14')).toBe(false)
  })

  it('does not fire twice in the same month', () => {
    expect(isDueToday({ ...base, recurring_last_run: '2026-09' }, '2026-09-15')).toBe(false)
  })

  it('does not fire for a holding that is not marked recurring', () => {
    expect(isDueToday({ ...base, is_recurring: 'false' }, '2026-09-15')).toBe(false)
  })

  it('clamps a day-31 holding to the last real day of a shorter month', () => {
    const day31 = { ...base, recurring_day: '31' }
    expect(isDueToday(day31, '2026-02-28')).toBe(true) // Feb 2026 has 28 days
    expect(isDueToday(day31, '2026-04-30')).toBe(true) // April has 30 days
  })
})

describe('isDueTomorrow', () => {
  it('fires when recurring_day matches tomorrow, regardless of recurring_last_run', () => {
    expect(isDueTomorrow(base, '2026-09-14')).toBe(true)
    expect(isDueTomorrow({ ...base, recurring_last_run: '2026-09' }, '2026-09-14')).toBe(true)
  })

  it('does not fire when tomorrow is not the recurring day', () => {
    expect(isDueTomorrow(base, '2026-09-15')).toBe(false)
  })

  it('rolls across a month boundary', () => {
    const day1 = { ...base, recurring_day: '1' }
    expect(isDueTomorrow(day1, '2026-08-31')).toBe(true)
  })
})

describe('tomorrowOf', () => {
  it('advances one calendar day', () => {
    expect(tomorrowOf('2026-09-14')).toBe('2026-09-15')
  })

  it('rolls across a month boundary', () => {
    expect(tomorrowOf('2026-08-31')).toBe('2026-09-01')
  })
})
