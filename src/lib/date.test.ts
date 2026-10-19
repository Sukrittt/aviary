import { describe, expect, it } from 'vitest'
import { nextOnDay, toLocalDateString, todayLocal } from './date'

describe('toLocalDateString', () => {
  it('converts an instant to its local calendar date (TZ pinned to IST in vitest.config.ts)', () => {
    // 2026-08-31T20:00:00Z + 5:30 = 2026-09-01T01:30:00 IST.
    expect(toLocalDateString(new Date('2026-08-31T20:00:00Z'))).toBe('2026-09-01')
  })

  it('does not roll back a day for an instant still in the same local date', () => {
    expect(toLocalDateString(new Date('2026-09-01T10:00:00Z'))).toBe('2026-09-01')
  })

  it('defaults to the current instant', () => {
    expect(todayLocal()).toBe(toLocalDateString())
  })
})

describe('nextOnDay', () => {
  it('keeps this month when the day is today or later', () => {
    expect(nextOnDay(15, new Date(2026, 9, 15))).toBe('2026-10-15')
    expect(nextOnDay(20, new Date(2026, 9, 15))).toBe('2026-10-20')
  })

  it('rolls to next month, clamped to its last day', () => {
    expect(nextOnDay(2, new Date(2026, 9, 19))).toBe('2026-11-02')
    expect(nextOnDay(31, new Date(2027, 0, 31, 12))).toBe('2027-01-31')
    expect(nextOnDay(31, new Date(2026, 10, 1))).toBe('2026-11-30')
    expect(nextOnDay(30, new Date(2027, 0, 31))).toBe('2027-02-28')
  })
})
