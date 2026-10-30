import { describe, it, expect } from 'vitest'
import { rollForward, getEffectiveDueDate, daysUntil, renewalDays, isSubscriptionDueToday } from './subscriptions'

function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

describe('rollForward', () => {
  it('advances a monthly cycle by one month', () => {
    expect(rollForward('2026-01-15', 'monthly')).toBe('2026-02-15')
  })

  it('advances a yearly cycle by one year', () => {
    expect(rollForward('2026-01-15', 'yearly')).toBe('2027-01-15')
  })

  it('advances a quarterly cycle by three months', () => {
    expect(rollForward('2026-01-15', 'quarterly')).toBe('2026-04-15')
  })

  it('advances a weekly cycle by seven days', () => {
    expect(rollForward('2026-01-15', 'weekly')).toBe('2026-01-22')
  })

  it('returns empty string for an unparseable date', () => {
    expect(rollForward('not-a-date', 'monthly')).toBe('')
  })
})

describe('getEffectiveDueDate', () => {
  it('returns a future nextDueDate unchanged', () => {
    const future = isoDaysFromNow(10)
    expect(
      getEffectiveDueDate({ nextDueDate: future, billingCycle: 'monthly', timestamp: '2026-01-01' }),
    ).toBe(future)
  })

  it('rolls a past monthly nextDueDate forward until it is in the future', () => {
    const past = isoDaysFromNow(-40)
    const result = getEffectiveDueDate({ nextDueDate: past, billingCycle: 'monthly', timestamp: '2026-01-01' })
    expect(new Date(result).getTime()).toBeGreaterThan(Date.now())
  })

  it('falls back to renewalOrEndMonth when nextDueDate is empty', () => {
    const y = new Date().getFullYear() + 1
    const result = getEffectiveDueDate({
      nextDueDate: '',
      billingCycle: 'yearly',
      renewalOrEndMonth: `March ${y}`,
      timestamp: '2026-01-01',
    })
    // `new Date(y, m, 1).toISOString()` shifts by a day around local-timezone
    // midnight, so accept the last day of Feb or the first of March.
    expect([`${y}-02-28`, `${y}-02-29`, `${y}-03-01`]).toContain(result)
  })

  it('falls back to a monthly cycle derived from timestamp when both other fields are empty', () => {
    const result = getEffectiveDueDate({ nextDueDate: '', billingCycle: 'monthly', timestamp: '2026-01-05' })
    expect(result).not.toBe('')
    expect(new Date(result).getTime()).toBeGreaterThan(Date.now())
  })

  it('returns empty string with no usable field', () => {
    expect(getEffectiveDueDate({ nextDueDate: '', billingCycle: 'one-time', timestamp: '' })).toBe('')
  })

  // Regression: a nextDueDate <= "now" (a live instant) used to be treated as
  // already past even when it fell on today's own calendar date, so a
  // subscription due today always rolled straight to next cycle instead of
  // resolving to today. `today` is passed explicitly here so the test is not
  // sensitive to the moment it happens to run.
  it('resolves a nextDueDate that is exactly today to today, not the next cycle', () => {
    expect(getEffectiveDueDate({ nextDueDate: '2026-09-02', billingCycle: 'monthly', timestamp: '2026-01-01' }, '2026-09-02')).toBe(
      '2026-09-02',
    )
  })

  it('rolls a nextDueDate that is exactly one cycle before today forward to today', () => {
    expect(getEffectiveDueDate({ nextDueDate: '2026-08-02', billingCycle: 'monthly', timestamp: '2026-01-01' }, '2026-09-02')).toBe(
      '2026-09-02',
    )
  })
})

describe('daysUntil', () => {
  it('returns empty string for no date', () => {
    expect(daysUntil('')).toBe('')
  })

  it('labels today and tomorrow specially', () => {
    expect(daysUntil(isoDaysFromNow(0))).toBe('renews today')
    expect(daysUntil(isoDaysFromNow(1))).toBe('renews tomorrow')
  })

  it('labels further-out dates with a day count', () => {
    expect(daysUntil(isoDaysFromNow(5))).toBe('renews in 5d')
  })

  it('returns empty string for a past date', () => {
    expect(daysUntil(isoDaysFromNow(-5))).toBe('')
  })
})

describe('renewalDays', () => {
  it('is Infinity for one-time subscriptions', () => {
    expect(renewalDays({ nextDueDate: isoDaysFromNow(5), billingCycle: 'one-time', timestamp: '2026-01-01' })).toBe(
      Infinity,
    )
  })

  it('is Infinity when no due date can be resolved', () => {
    expect(renewalDays({ nextDueDate: '', billingCycle: 'one-time', timestamp: '' })).toBe(Infinity)
  })

  it('counts days to a future due date', () => {
    expect(renewalDays({ nextDueDate: isoDaysFromNow(7), billingCycle: 'monthly', timestamp: '2026-01-01' })).toBe(7)
  })

  it('is 0 for a subscription due exactly today', () => {
    expect(
      renewalDays({ nextDueDate: '2026-09-02', billingCycle: 'monthly', timestamp: '2026-01-01' }, '2026-09-02'),
    ).toBe(0)
  })
})

describe('isSubscriptionDueToday', () => {
  const today = '2026-09-02'

  it('is true for an active monthly subscription due today', () => {
    expect(
      isSubscriptionDueToday({ nextDueDate: today, billingCycle: 'monthly', timestamp: '2026-01-01' }, today),
    ).toBe(true)
  })

  it('is false for a subscription due on a different day', () => {
    expect(
      isSubscriptionDueToday({ nextDueDate: '2026-09-15', billingCycle: 'monthly', timestamp: '2026-01-01' }, today),
    ).toBe(false)
  })

  it('is false for a cancelled subscription due today', () => {
    expect(
      isSubscriptionDueToday(
        { nextDueDate: today, billingCycle: 'monthly', timestamp: '2026-01-01', status: 'cancelled' },
        today,
      ),
    ).toBe(false)
  })

  it('is false for a one-time subscription, even if due today', () => {
    expect(
      isSubscriptionDueToday({ nextDueDate: today, billingCycle: 'one-time', timestamp: '2026-01-01' }, today),
    ).toBe(false)
  })
})

describe('month-end subscriptions', () => {
  const sub = { nextDueDate: '2026-01-31', billingCycle: 'monthly', timestamp: '' }

  it('clamps to the end of a short month instead of skipping it', () => {
    expect(rollForward('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(rollForward('2028-02-29', 'yearly')).toBe('2029-02-28')
    expect(rollForward('2026-11-30', 'quarterly')).toBe('2027-02-28')
  })

  it('comes back to the 31st after February rather than drifting', () => {
    expect(getEffectiveDueDate(sub, '2026-02-01')).toBe('2026-02-28')
    expect(getEffectiveDueDate(sub, '2026-03-01')).toBe('2026-03-31')
    expect(getEffectiveDueDate(sub, '2026-04-01')).toBe('2026-04-30')
    expect(isSubscriptionDueToday(sub, '2026-02-28')).toBe(true)
    expect(isSubscriptionDueToday(sub, '2026-03-03')).toBe(false)
  })

  it('keeps the anchor when told it', () => {
    expect(rollForward('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
  })
})
