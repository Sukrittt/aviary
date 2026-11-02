import { describe, expect, it } from 'vitest'
import type { RecurringIncomeRow } from '@/src/types'
import { upcomingPayday } from './upcomingPay'

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
