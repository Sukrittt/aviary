/**
 * The one-time "here's what we learned about you" recap, shown once on Web or
 * Mobile after a user's first week. Pure: no I/O, no clock. The route reads
 * the user and their first week of expenses and hands them in.
 *
 * Week one is too short for lib's habit detection (it wants the same spend 3
 * times on the same weekday), so this reads lighter patterns: repeats, the
 * usual time of day they log, and where the money went.
 */

import { nowIn } from '@/lib/http'

/** Days after onboarding the recap stays due. Anyone later than this missed it for good. */
const DUE_DAYS = 7

/** Logged by the server on a schedule, not by a person at a moment. */
const AUTO_SOURCES = new Set(['recurring', 'subscription'])

export interface WeekRecap {
  startDate: string
  endDate: string
  totalTransactions: number
  totalSpent: number
  /** Distinct days with at least one expense, out of 7. */
  daysLogged: number
  topCategory: { category: string; total: number; pct: number } | null
  biggest: { item: string; category: string; amountInr: number; date: string } | null
  /** Items logged 2+ times, most frequent first, at most 3. */
  repeats: { item: string; category: string; count: number }[]
  /** Median minute after local midnight they log at, or null with nothing logged. */
  usualMinute: number | null
  /** Each date with an expense, ascending. */
  loggedDates: string[]
  /** Every log's minute after local midnight, ascending. */
  logMinutes: number[]
  /** Biggest categories first, at most 4. The first is `topCategory`. */
  categories: { category: string; total: number; pct: number }[]
}

export type RecapRow = { date: string; timestamp: string; item: string; category: string; amount_inr: string; source?: string }

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

/** `start` is the local date the user onboarded. Day 7 is `dueFrom`. */
export function recapWindow(start: string) {
  return { start, end: addDays(start, 6), dueFrom: addDays(start, 7), dueUntil: addDays(start, 7 + DUE_DAYS) }
}

/** The local date a user onboarded on, in their own timezone. */
export function onboardedDate(user: { onboardedAt?: string | null; timezone?: string }): string | null {
  return user.onboardedAt ? nowIn(user.timezone, new Date(user.onboardedAt)).date : null
}

/**
 * Which day of the first week `today` is, counting the onboarding date as
 * day 1, or null outside days 1 to 7. Drives the "learning you" card and
 * the day 3 and day 5 teaser pushes; the recap itself is due the day after.
 */
export function learningDay(onboardedDate: string | null, today: string): number | null {
  if (!onboardedDate) return null
  const day = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${onboardedDate}T00:00:00Z`)) / 86_400_000) + 1
  return day >= 1 && day <= 7 ? day : null
}

export function recapDue(onboardedDate: string | null, seenAt: string | null | undefined, today: string): boolean {
  if (!onboardedDate || seenAt) return false
  const { dueFrom, dueUntil } = recapWindow(onboardedDate)
  return today >= dueFrom && today <= dueUntil
}

export function computeWeekRecap(rows: RecapRow[], start: string): WeekRecap {
  const { end } = recapWindow(start)
  const week = rows
    .map((r) => ({ ...r, item: r.item.trim(), amount: Number(r.amount_inr) }))
    .filter((r) => r.date >= start && r.date <= end && r.amount > 0 && r.item && !AUTO_SOURCES.has(r.source ?? ''))

  const totalSpent = week.reduce((s, r) => s + r.amount, 0)

  const byCategory = new Map<string, number>()
  for (const r of week) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount)
  const categories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([category, total]) => ({ category, total, pct: (total / totalSpent) * 100 }))

  const biggest = week.reduce<(typeof week)[number] | null>((max, r) => (!max || r.amount > max.amount ? r : max), null)

  const byItem = new Map<string, { item: string; category: string; count: number }>()
  for (const r of week) {
    const key = r.item.toLowerCase()
    const seen = byItem.get(key)
    if (seen) seen.count++
    else byItem.set(key, { item: r.item, category: r.category, count: 1 })
  }

  const minutes = week
    .map((r) => r.timestamp.slice(11, 16))
    .filter((t) => /^\d\d:\d\d$/.test(t))
    .map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)))
    .sort((a, b) => a - b)

  return {
    startDate: start,
    endDate: end,
    totalTransactions: week.length,
    totalSpent,
    daysLogged: new Set(week.map((r) => r.date)).size,
    topCategory: categories[0] ?? null,
    biggest: biggest ? { item: biggest.item, category: biggest.category, amountInr: biggest.amount, date: biggest.date } : null,
    repeats: [...byItem.values()].filter((r) => r.count >= 2).sort((a, b) => b.count - a.count).slice(0, 3),
    usualMinute: minutes.length ? median(minutes) : null,
    loggedDates: [...new Set(week.map((r) => r.date))].sort(),
    logMinutes: minutes,
    categories,
  }
}
