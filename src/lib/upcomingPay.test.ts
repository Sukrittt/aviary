import { describe, expect, it } from 'vitest'
import type { RecurringIncomeRow } from '@/src/types'
import { ordinal, paydayHint, paydayInMonth, upcomingPayday } from './upcomingPay'

const schedule = (next_run_date: string, status = 'active') => ({ next_run_date, status }) as RecurringIncomeRow

describe('upcomingPayday', () => {
  it('picks the soonest payday of the running schedules', () => {
    const paused = schedule('2026-11-05', 'paused')
    const soon = schedule('2026-11-20')
    expect(upcomingPayday([schedule('2026-11-25'), paused, soon])).toBe(soon)
  })

  it('has nothing to say without a schedule', () => {
    expect(upcomingPayday([])).toBeUndefined()
  })
})

describe('picking a payday by day of the month', () => {
  it('names the day', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st'])
  })

  it("lands on that day this month, or the month's last day when it's short", () => {
    expect(paydayInMonth(20, '2026-11-02')).toBe('2026-11-20')
    expect(paydayInMonth(31, '2026-11-02')).toBe('2026-11-30')
    expect(paydayInMonth(31, '2027-02-10')).toBe('2027-02-28')
    expect(paydayInMonth(5, '2026-11-02')).toBe('2026-11-05')
  })

  it('says the plan fills up now once the day has come, and when otherwise', () => {
    expect(paydayHint(1, '2026-11-02')).toBe("That's already landed, so your plan fills up now.")
    expect(paydayHint(2, '2026-11-02')).toBe("That's already landed, so your plan fills up now.")
    expect(paydayHint(20, '2026-11-02')).toBe('Your plan fills up Nov 20.')
    expect(paydayHint(31, '2026-11-02')).toBe('Your plan fills up Nov 30.')
  })
})
