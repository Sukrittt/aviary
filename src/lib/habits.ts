import type { ExpenseRow } from '@/src/types'

/**
 * Spending habits read off the user's own history. Twin of Mobile's
 * src/lib/habits.ts, which schedules the "time to log it?" nudges from them on
 * the phone. Web only needs the detection, for the line after a log. Pure.
 *
 * A habit is the same spend (item + category) logged on the same weekday at
 * least MIN_HITS times in the last LOOKBACK_DAYS, inside one SLOT_MIN window.
 * Weekdays whose slots line up merge into one habit, so a nightly spend and a
 * Mon/Wed/Fri one fall out of the same rule.
 *
 * That rule takes 3 weeks to see a daily coffee, so a second pass pools every
 * weekday: the same spend on MIN_HITS different days of the last POOL_DAYS,
 * in one slot, is a habit too. It lands in the same group as the weekday
 * rule's slots when they line up, so one spend never makes two habits.
 *
 * Time of day is when the spend was *logged*, not spent. Someone who logs
 * their whole day at night looks like a 10pm habit; settleNudges' shift is
 * how the schedule walks toward when they actually respond.
 */

export type Habit = {
  id: string
  item: string
  category: string
  amountInr: number
  paymentMethod: string
  /** 0 = Sunday, ascending. */
  weekdays: number[]
  /** Minutes after local midnight. */
  minute: number
  /** Hits behind this habit. Ranks habits when a day has too many. */
  count: number
}

const LOOKBACK_DAYS = 56
const POOL_DAYS = 14
const STALE_DAYS = 21
const MIN_HITS = 3
const SLOT_MIN = 120

// Logged by the server on a schedule, not by a person at a moment.
const AUTO_SOURCES = new Set(['recurring', 'subscription'])

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const keyOf = (r: Pick<ExpenseRow, 'item' | 'category'>) => `${normalize(r.category)}|${normalize(r.item)}`
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function mostCommon(xs: string[]): string {
  const counts = new Map<string, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

type Hit = { row: ExpenseRow; minute: number }

/** A row nudges can learn from, with the minute it was logged. Null for the rest. */
function hitOf(row: ExpenseRow, today: string): Hit | null {
  if (AUTO_SOURCES.has(row.source)) return null
  if (!(Number(row.amount_inr) > 0) || !row.item.trim()) return null
  const age = daysBetween(row.date, today)
  if (age < 0 || age > LOOKBACK_DAYS) return null
  const time = row.timestamp.slice(11, 16)
  if (!/^\d\d:\d\d$/.test(time)) return null
  return { row, minute: Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) }
}

// Days, not logs: two coffees one morning are one day of the habit.
const dayCount = (hits: Hit[]) => new Set(hits.map((h) => h.row.date)).size

/** Every SLOT_MIN window with enough days in it, densest taken first. */
function slotsOf(hits: Hit[]): Hit[][] {
  let rest = [...hits].sort((a, b) => a.minute - b.minute)
  const slots: Hit[][] = []
  for (;;) {
    let best: Hit[] = []
    for (let i = 0, j = 0; j < rest.length; j++) {
      while (rest[j].minute - rest[i].minute > SLOT_MIN) i++
      if (dayCount(rest.slice(i, j + 1)) > dayCount(best)) best = rest.slice(i, j + 1)
    }
    if (dayCount(best) < MIN_HITS) return slots
    slots.push(best)
    rest = rest.filter((h) => !best.includes(h))
  }
}

/**
 * Every weekday but the ones that came round since the first of these days
 * and got skipped: a Mon to Fri coffee drops the weekend once it's passed,
 * while a 3-day-old one still nudges all 7.
 */
function pooledWeekdays(hits: Hit[], today: string): number[] {
  const first = hits.reduce((a, h) => (h.row.date < a ? h.row.date : a), today)
  const seen = new Set(hits.map((h) => weekdayOf(h.row.date)))
  const since = daysBetween(first, today)
  return [0, 1, 2, 3, 4, 5, 6].filter((w) => seen.has(w) || (w - weekdayOf(first) + 7) % 7 >= since)
}

export function findHabits(rows: ExpenseRow[], today: string): Habit[] {
  const byKey = new Map<string, Hit[]>()
  for (const row of rows) {
    const hit = hitOf(row, today)
    if (hit) byKey.set(keyOf(row), [...(byKey.get(keyOf(row)) ?? []), hit])
  }

  const habits: Habit[] = []
  for (const [key, hits] of byKey) {
    const days = Array.from({ length: 7 }, (_, weekday) => hits.filter((h) => weekdayOf(h.row.date) === weekday))
    const recent = hits.filter((h) => daysBetween(h.row.date, today) < POOL_DAYS)
    // One slot per weekday plus the pooled ones, then merge slots that sit close together.
    const slots = [
      ...days.flatMap((dayHits, weekday) => slotsOf(dayHits).map((slot) => ({ weekdays: [weekday], hits: slot }))),
      ...slotsOf(recent).map((slot) => ({ weekdays: pooledWeekdays(slot, today), hits: slot })),
    ]
      .filter((s) => s.hits.some((h) => daysBetween(h.row.date, today) <= STALE_DAYS))
      .map((s) => ({ ...s, minute: median(s.hits.map((h) => h.minute)) }))
      .sort((a, b) => a.minute - b.minute)

    const groups: (typeof slots)[] = []
    for (const slot of slots) {
      const last = groups[groups.length - 1]
      if (last && slot.minute - last[0].minute <= SLOT_MIN) last.push(slot)
      else groups.push([slot])
    }

    // A row can sit in both a weekday slot and a pooled one.
    const grouped = groups.map((group) => ({ group, hits: [...new Set(group.flatMap((s) => s.hits))] }))
    // Mobile's HabitState is keyed by id, so the longest-running group keeps the bare
    // key when a new slot shows up. ponytail: the rest are numbered by time of
    // day, so a new earlier slot renumbers them; persist slot ids if that bites.
    const oldest = (hits: Hit[]) => hits.reduce((a, h) => (h.row.date < a ? h.row.date : a), today)
    const main = grouped.reduce((a, g) => (oldest(g.hits) < oldest(a.hits) ? g : a), grouped[0])
    grouped.forEach((g, i) => {
      const { group, hits } = g
      const newest = hits.reduce((a, b) => (b.row.timestamp > a.row.timestamp ? b : a))
      const minute = median(hits.map((h) => h.minute))
      habits.push({
        id: g === main ? key : `${key}#${i}`,
        item: mostCommon(hits.map((h) => h.row.item.trim())),
        category: newest.row.category,
        amountInr: median(hits.map((h) => Number(h.row.amount_inr))),
        paymentMethod: mostCommon(hits.map((h) => h.row.payment_method || 'bank')),
        weekdays: [...new Set(group.flatMap((s) => s.weekdays))].sort((a, b) => a - b),
        minute,
        count: hits.length,
      })
    })
  }
  return habits.sort((a, b) => a.minute - b.minute)
}

export type HabitProgress = { seen: number; left: number; habit: boolean }

/**
 * How close `expense` is to being a habit, for the line after a log: the days
 * it's been logged in the last POOL_DAYS within one SLOT_MIN window of this
 * log's time, this one included, and whether findHabits already counts it.
 * Null for spends nudges never learn from (or a log backdated past the pool).
 */
export function habitProgress(rows: ExpenseRow[], expense: ExpenseRow, today: string): HabitProgress | null {
  const self = hitOf(expense, today)
  if (!self || daysBetween(expense.date, today) >= POOL_DAYS) return null
  // The refetch may or may not have brought this log back yet.
  const isSelf = (r: ExpenseRow) => (!!expense.id && r.id === expense.id) || r.timestamp === expense.timestamp
  const all = [...rows.filter((r) => !isSelf(r)), expense]
  const key = keyOf(expense)
  const near = all
    .filter((r) => keyOf(r) === key)
    .map((r) => hitOf(r, today))
    .filter((h): h is Hit => !!h && daysBetween(h.row.date, today) < POOL_DAYS)
  // The fullest window that still holds this log.
  const seen = Math.max(
    ...near
      .filter((s) => s.minute >= self.minute - SLOT_MIN && s.minute <= self.minute)
      .map((s) => dayCount(near.filter((h) => h.minute >= s.minute && h.minute <= s.minute + SLOT_MIN))),
  )
  const habit = findHabits(all, today).some((h) => keyOf(h) === key && Math.abs(h.minute - self.minute) <= SLOT_MIN)
  return { seen, left: habit ? 0 : Math.max(MIN_HITS - seen, 1), habit }
}
