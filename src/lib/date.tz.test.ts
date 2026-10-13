// A user west of both UTC and IST: 8pm on 7 Oct here is already 8 Oct in UTC and IST.
process.env.TZ = 'America/Mexico_City'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { nowLocal, parseLocalDate, todayLocal } from './date'
import { lastSpentLabel } from './envelopeDisplay'
import { mintExpensePayload } from '../api/expenses'

const EVENING_7_OCT = new Date('2026-10-08T02:00:00Z') // 20:00 on 7 Oct, Mexico City

afterEach(() => vi.useRealTimers())

describe('dates west of UTC', () => {
  it('reads a stored date as that calendar day, not the day before', () => {
    const d = parseLocalDate('2026-10-08')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 8])
  })

  it("dates today by the user's own clock, not IST's", () => {
    vi.useFakeTimers()
    vi.setSystemTime(EVENING_7_OCT)
    expect(todayLocal()).toBe('2026-10-07')
    expect(nowLocal().timestamp).toBe('2026-10-07T20:00:00-06:00')
  })

  it('logs an evening expense on the day it was spent', () => {
    vi.useFakeTimers()
    vi.setSystemTime(EVENING_7_OCT)
    const payload = mintExpensePayload({ item: 'Tacos', amount_inr: '120', category: 'Eating Out' })
    expect(payload.date).toBe('2026-10-07')
    expect(payload.timestamp).toBe('2026-10-07T20:00:00-06:00')
  })

  it('labels an expense from earlier today as Today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(EVENING_7_OCT)
    expect(lastSpentLabel('2026-10-07')).toBe('Today')
    expect(lastSpentLabel('2026-10-06')).toBe('Yesterday')
  })
})
