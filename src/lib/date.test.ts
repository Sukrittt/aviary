import { describe, expect, it } from 'vitest'
import { toLocalDateString, todayLocal } from './date'

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
