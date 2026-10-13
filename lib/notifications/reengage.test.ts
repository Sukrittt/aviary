import { describe, it, expect } from 'vitest'
import { quietDays, reengageCopy, reengageStep, REENGAGE_STEPS } from './reengage'

describe('quietDays', () => {
  it('counts local calendar days since last seen', () => {
    const at = new Date('2026-10-06T15:00:00Z') // 20:30 IST on the 6th
    expect(quietDays(new Date('2026-10-06T03:00:00Z'), 'Asia/Kolkata', at)).toBe(0)
    expect(quietDays(new Date('2026-10-03T03:00:00Z'), 'Asia/Kolkata', at)).toBe(3)
  })

  it('uses the user timezone for the day boundary', () => {
    // 18:45 UTC on the 2nd is 00:15 IST on the 3rd: three days quiet in IST, four in UTC.
    const lastSeen = new Date('2026-10-02T18:45:00Z')
    const at = new Date('2026-10-06T15:00:00Z')
    expect(quietDays(lastSeen, 'Asia/Kolkata', at)).toBe(3)
    expect(quietDays(lastSeen, 'UTC', at)).toBe(4)
  })
})

describe('reengageStep', () => {
  it('is null before the first step', () => {
    expect(reengageStep(0)).toBeNull()
    expect(reengageStep(2)).toBeNull()
  })

  it('returns the furthest step passed, so a long-gone user gets one catch-up', () => {
    expect(reengageStep(3)).toBe(3)
    expect(reengageStep(6)).toBe(3)
    expect(reengageStep(7)).toBe(7)
    expect(reengageStep(14)).toBe(14)
    expect(reengageStep(29)).toBe(14)
    expect(reengageStep(30)).toBe(30)
    expect(reengageStep(400)).toBe(30)
  })
})

describe('reengageCopy', () => {
  it('has copy for every step, rotating by day, with no em dashes', () => {
    for (const step of REENGAGE_STEPS) {
      const a = reengageCopy(step, '2026-10-06')
      const b = reengageCopy(step, '2026-10-07')
      expect(a).not.toEqual(b)
      expect(`${a.title}${a.body}${b.title}${b.body}`).not.toContain('—')
    }
  })
})
