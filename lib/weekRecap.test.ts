import { describe, expect, it } from 'vitest'
import { computeWeekRecap, recapDue, recapWindow } from './weekRecap'

const row = (date: string, time: string, item: string, category: string, amount: number, source = 'manual') => ({
  date,
  timestamp: `${date}T${time}:00+05:30`,
  item,
  category,
  amount_inr: String(amount),
  source,
})

describe('recapWindow', () => {
  it('covers the 7 days from onboarding and is due from day 7 to day 14', () => {
    expect(recapWindow('2026-10-01')).toEqual({ start: '2026-10-01', end: '2026-10-07', dueFrom: '2026-10-08', dueUntil: '2026-10-15' })
  })

  it('crosses month ends', () => {
    expect(recapWindow('2026-09-28').end).toBe('2026-10-04')
  })
})

describe('recapDue', () => {
  it('is due on day 7 through day 14 when unseen', () => {
    expect(recapDue('2026-10-01', null, '2026-10-07')).toBe(false)
    expect(recapDue('2026-10-01', null, '2026-10-08')).toBe(true)
    expect(recapDue('2026-10-01', null, '2026-10-15')).toBe(true)
    expect(recapDue('2026-10-01', null, '2026-10-16')).toBe(false)
  })

  it('is never due once seen or before onboarding', () => {
    expect(recapDue('2026-10-01', '2026-10-08T10:00:00.000Z', '2026-10-09')).toBe(false)
    expect(recapDue(null, null, '2026-10-09')).toBe(false)
  })
})

describe('computeWeekRecap', () => {
  const rows = [
    row('2026-10-01', '09:10', 'Chai', 'Food', 20),
    row('2026-10-02', '09:40', 'chai ', 'Food', 25),
    row('2026-10-03', '21:05', 'Chai', 'Food', 20),
    row('2026-10-03', '21:00', 'Uber', 'Transport', 300),
    row('2026-10-05', '20:30', 'Uber', 'Transport', 250),
    row('2026-10-06', '21:15', 'Shoes', 'Shopping', 2000),
  ]

  it('summarises the first week', () => {
    const recap = computeWeekRecap(rows, '2026-10-01')
    expect(recap.startDate).toBe('2026-10-01')
    expect(recap.endDate).toBe('2026-10-07')
    expect(recap.totalTransactions).toBe(6)
    expect(recap.totalSpent).toBe(2615)
    expect(recap.daysLogged).toBe(5)
    expect(recap.topCategory).toEqual({ category: 'Shopping', total: 2000, pct: (2000 / 2615) * 100 })
    expect(recap.biggest).toEqual({ item: 'Shoes', category: 'Shopping', amountInr: 2000, date: '2026-10-06' })
  })

  it('finds repeats case-insensitively, most frequent first, and only 2+', () => {
    expect(computeWeekRecap(rows, '2026-10-01').repeats).toEqual([
      { item: 'Chai', category: 'Food', count: 3 },
      { item: 'Uber', category: 'Transport', count: 2 },
    ])
  })

  it('lists the days logged, every log time, and up to 4 categories', () => {
    const recap = computeWeekRecap(rows, '2026-10-01')
    expect(recap.loggedDates).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06'])
    expect(recap.logMinutes).toEqual([550, 580, 1230, 1260, 1265, 1275])
    expect(recap.categories.map((c) => c.category)).toEqual(['Shopping', 'Transport', 'Food'])
    expect(recap.categories[0]).toEqual(recap.topCategory)
  })

  it('reports the median logging minute', () => {
    // Sorted minutes: 550, 580, 1230, 1260, 1265, 1275 -> median (1230 + 1260) / 2
    expect(computeWeekRecap(rows, '2026-10-01').usualMinute).toBe(1245)
  })

  it('ignores rows outside the week, refunds and auto-logged rows', () => {
    const recap = computeWeekRecap(
      [
        ...rows,
        row('2026-09-30', '09:00', 'Chai', 'Food', 20),
        row('2026-10-08', '09:00', 'Chai', 'Food', 20),
        row('2026-10-04', '09:00', 'Refund', 'Food', -50),
        row('2026-10-04', '00:00', 'Netflix', 'Bills', 649, 'subscription'),
        row('2026-10-04', '00:00', 'Rent', 'Bills', 9000, 'recurring'),
      ],
      '2026-10-01',
    )
    expect(recap.totalTransactions).toBe(6)
    expect(recap.daysLogged).toBe(5)
  })

  it('returns an empty recap when nothing was logged', () => {
    expect(computeWeekRecap([], '2026-10-01')).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-07',
      totalTransactions: 0,
      totalSpent: 0,
      daysLogged: 0,
      topCategory: null,
      biggest: null,
      repeats: [],
      usualMinute: null,
      loggedDates: [],
      logMinutes: [],
      categories: [],
    })
  })
})
