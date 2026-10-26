import { describe, expect, it } from 'vitest'
import { findHabits, habitProgress } from './habits'
import type { ExpenseRow } from '@/src/types'

// 2026-09-28 is a Monday.
const TODAY = '2026-10-01' // Thursday

function row(date: string, time: string, item: string, amount: number, extra: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    timestamp: `${date}T${time}:00+05:30`,
    date,
    item,
    amount_inr: String(amount),
    category: extra.category ?? 'Groceries',
    notes: '',
    source: 'manual',
    amount: String(amount),
    description: '',
    payment_method: 'bank',
    ...extra,
  }
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** `weeks` consecutive weeks of the same weekday, ending at `last`. */
function weekly(last: string, weeks: number, time: string, item: string, amount: number, extra: Partial<ExpenseRow> = {}): ExpenseRow[] {
  return Array.from({ length: weeks }, (_, i) => row(addDays(last, -7 * i), time, item, amount, extra))
}

describe('findHabits', () => {
  it('finds a Mon/Wed/Fri evening habit as one habit', () => {
    const rows = [
      ...weekly('2026-09-28', 4, '19:10', 'Football', 200, { category: 'Fun' }),
      ...weekly('2026-09-30', 4, '19:40', 'football ', 200, { category: 'Fun' }),
      ...weekly('2026-09-25', 4, '18:50', 'Football', 250, { category: 'Fun' }),
    ]
    const habits = findHabits(rows, TODAY)
    expect(habits).toHaveLength(1)
    expect(habits[0]).toMatchObject({ item: 'Football', category: 'Fun', weekdays: [1, 3, 5], amountInr: 200, paymentMethod: 'bank' })
    expect(habits[0].minute).toBeGreaterThanOrEqual(18 * 60 + 50)
    expect(habits[0].minute).toBeLessThanOrEqual(19 * 60 + 40)
  })

  it('finds a nightly habit across every weekday', () => {
    const rows = Array.from({ length: 28 }, (_, i) => row(addDays('2026-09-30', -i), '21:30', 'Groceries', 300))
    const [habit] = findHabits(rows, TODAY)
    expect(habit.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(habit.minute).toBe(21 * 60 + 30)
  })

  it('needs at least 3 hits on a weekday', () => {
    expect(findHabits(weekly('2026-09-28', 2, '19:00', 'Football', 200), TODAY)).toEqual([])
  })

  it('ignores hits spread across the day', () => {
    const rows = [row('2026-09-28', '08:00', 'Coffee', 100), row('2026-09-21', '13:00', 'Coffee', 100), row('2026-09-14', '20:00', 'Coffee', 100)]
    expect(findHabits(rows, TODAY)).toEqual([])
  })

  it('drops a habit that stopped more than 3 weeks ago', () => {
    expect(findHabits(weekly('2026-09-07', 5, '19:00', 'Football', 200), TODAY)).toEqual([])
  })

  it('only looks back 8 weeks', () => {
    const rows = [...weekly('2026-09-28', 2, '19:00', 'Football', 200), row('2026-07-27', '19:00', 'Football', 200)]
    expect(findHabits(rows, TODAY)).toEqual([])
  })

  it('skips spends the server logged on its own', () => {
    expect(findHabits(weekly('2026-09-28', 4, '03:00', 'Netflix', 199, { source: 'subscription' }), TODAY)).toEqual([])
    expect(findHabits(weekly('2026-09-28', 4, '03:00', 'Rent', 9000, { source: 'recurring' }), TODAY)).toEqual([])
  })

  it('keeps two time slots of the same spend apart', () => {
    const rows = [...weekly('2026-09-28', 4, '08:00', 'Coffee', 100), ...weekly('2026-09-28', 4, '16:00', 'Coffee', 150)]
    const habits = findHabits(rows, TODAY)
    expect(habits.map((h) => h.minute)).toEqual([8 * 60, 16 * 60])
    expect(new Set(habits.map((h) => h.id)).size).toBe(2)
  })
})

describe('findHabits, across weekdays', () => {
  /** One log a day for `days` days ending yesterday (2026-09-30). */
  const daily = (days: number, time: string, item: string, extra: Partial<ExpenseRow> = {}) =>
    Array.from({ length: days }, (_, i) => row(addDays('2026-09-30', -i), time, item, 120, extra))

  it('finds a daily coffee after 3 days, nudging every weekday', () => {
    const habits = findHabits(daily(3, '09:05', 'Coffee', { category: 'Food' }), TODAY)
    expect(habits).toHaveLength(1)
    expect(habits[0]).toMatchObject({ id: 'food|coffee', item: 'Coffee', weekdays: [0, 1, 2, 3, 4, 5, 6], minute: 9 * 60 + 5 })
  })

  it('needs 3 different days, not 3 logs', () => {
    const rows = [row('2026-09-30', '09:00', 'Coffee', 100), row('2026-09-30', '09:30', 'Coffee', 100), row('2026-09-29', '09:10', 'Coffee', 100)]
    expect(findHabits(rows, TODAY)).toEqual([])
  })

  it('needs the days to line up in one time slot', () => {
    const rows = [row('2026-09-30', '08:00', 'Coffee', 100), row('2026-09-29', '13:00', 'Coffee', 100), row('2026-09-28', '20:00', 'Coffee', 100)]
    expect(findHabits(rows, TODAY)).toEqual([])
  })

  it('only pools the last 2 weeks', () => {
    const rows = [row('2026-09-30', '09:00', 'Coffee', 100), row('2026-09-29', '09:00', 'Coffee', 100), row('2026-09-16', '09:00', 'Coffee', 100)]
    expect(findHabits(rows, TODAY)).toEqual([])
  })

  it('keeps the exclusions', () => {
    expect(findHabits(daily(3, '03:00', 'Netflix', { source: 'subscription' }), TODAY)).toEqual([])
    expect(findHabits(daily(3, '09:00', 'Coffee', { amount_inr: '0' }), TODAY)).toEqual([])
    expect(findHabits(daily(3, '09:00', '  '), TODAY)).toEqual([])
  })

  it('drops weekdays that came round and got skipped', () => {
    // Mon to Fri for two weeks, never on a weekend.
    const rows = daily(14, '09:00', 'Coffee').filter((r) => ![0, 6].includes(new Date(`${r.date}T00:00:00Z`).getUTCDay()))
    expect(findHabits(rows, TODAY)[0].weekdays).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps weekdays that have not come round yet', () => {
    // Mon, Tue, Wed, then today (Thu) before the usual time: nothing skipped so far.
    expect(findHabits(daily(3, '09:00', 'Coffee'), TODAY)[0].weekdays).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('merges with the weekday rule into one habit, keeping its id', () => {
    // A month of Mon/Wed/Fri: both rules see it. One habit, still only those days.
    const rows = [
      ...weekly('2026-09-28', 4, '19:10', 'Football', 200, { category: 'Fun' }),
      ...weekly('2026-09-30', 4, '19:40', 'Football', 200, { category: 'Fun' }),
      ...weekly('2026-09-25', 4, '18:50', 'Football', 200, { category: 'Fun' }),
    ]
    const habits = findHabits(rows, TODAY)
    expect(habits).toHaveLength(1)
    expect(habits[0]).toMatchObject({ id: 'fun|football', weekdays: [1, 3, 5], count: 12 })
  })

  it('widens a weekday habit once the spend turns daily', () => {
    // 3 Wednesdays at 9am, then every day this past week.
    const rows = [...weekly('2026-09-23', 3, '09:00', 'Coffee', 100), ...daily(8, '09:00', 'Coffee')]
    const habits = findHabits(rows, TODAY)
    expect(habits).toHaveLength(1)
    expect(habits[0].weekdays).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('keeps an established habit id when a new time slot shows up', () => {
    const morning = weekly('2026-09-30', 4, '09:00', 'Coffee', 100)
    expect(findHabits(morning, TODAY).map((h) => h.id)).toEqual(['groceries|coffee'])
    const habits = findHabits([...morning, ...daily(3, '16:00', 'Coffee')], TODAY)
    expect(habits.map((h) => h.id)).toEqual(['groceries|coffee', 'groceries|coffee#1'])
    // A log a minute either side of the hour doesn't rename the newer one.
    expect(findHabits([...morning, ...daily(3, '15:59', 'Coffee'), row('2026-09-30', '16:01', 'Coffee', 100)], TODAY).map((h) => h.id)).toEqual(['groceries|coffee', 'groceries|coffee#1'])
  })

  it('leaves a weekly spend to the weekday rule', () => {
    expect(findHabits(weekly('2026-09-25', 2, '22:00', 'Uber', 300), TODAY)).toEqual([])
    expect(findHabits(weekly('2026-09-25', 3, '22:00', 'Uber', 300), TODAY)[0].weekdays).toEqual([5])
  })
})

describe('habitProgress', () => {
  const coffee = (date: string, time = '09:00', extra: Partial<ExpenseRow> = {}) => row(date, time, 'Coffee', 100, { id: `c-${date}-${time}`, ...extra })

  it('counts days in the same time slot, this log included', () => {
    expect(habitProgress([coffee('2026-09-30')], coffee(TODAY), TODAY)).toEqual({ seen: 2, left: 1, habit: false })
  })

  it('counts this log once when the list already has it', () => {
    const now = coffee(TODAY)
    expect(habitProgress([coffee('2026-09-30'), now], now, TODAY)).toEqual({ seen: 2, left: 1, habit: false })
  })

  it('sees the first log as 1', () => {
    expect(habitProgress([], coffee(TODAY), TODAY)).toEqual({ seen: 1, left: 2, habit: false })
  })

  it('ignores logs at another time of day, or the same day', () => {
    expect(habitProgress([coffee('2026-09-30', '20:00'), coffee(TODAY, '08:00')], coffee(TODAY), TODAY)).toEqual({ seen: 1, left: 2, habit: false })
  })

  it('is a habit on the third day', () => {
    expect(habitProgress([coffee('2026-09-29'), coffee('2026-09-30')], coffee(TODAY), TODAY)).toEqual({ seen: 3, left: 0, habit: true })
  })

  it('is a habit when the weekday rule already found one', () => {
    const rows = weekly('2026-09-24', 3, '09:00', 'Coffee', 100)
    expect(habitProgress(rows, coffee(TODAY, '09:00'), TODAY)).toMatchObject({ habit: true })
  })

  it('only counts a habit at this time of day', () => {
    const evening = weekly('2026-09-30', 4, '20:00', 'Coffee', 100)
    expect(habitProgress(evening, coffee(TODAY), TODAY)).toEqual({ seen: 1, left: 2, habit: false })
    expect(habitProgress([...evening, coffee('2026-09-30')], coffee(TODAY), TODAY)).toEqual({ seen: 2, left: 1, habit: false })
  })

  it('has nothing to say about spends nudges never cover', () => {
    expect(habitProgress([], coffee(TODAY, '09:00', { amount_inr: '0' }), TODAY)).toBeNull()
    expect(habitProgress([], coffee(TODAY, '09:00', { timestamp: '' }), TODAY)).toBeNull()
  })
})
