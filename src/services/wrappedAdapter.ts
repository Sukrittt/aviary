import type { Row } from '@/lib/models'
import { parseLocalDate } from '@/src/lib/date'
import { CREDIT_CARD_CATEGORY, INCOME_CATEGORY } from '@/src/lib/envelope'

export interface WrappedData {
  month: string
  range: { startDate: string; endDate: string; daysTracked: number }
  totalSpent: number
  totalTransactions: number
  topCategories: Array<{ category: string; total: number; pct: number }>
  biggestPurchase: { item: string; amountInr: number; category: string; date: string } | null
  topWeekday: { day: string; total: number; count: number } | null
  longestStreak: { days: number; startDate: string; endDate: string } | null
  longestGap: { days: number; startDate: string; endDate: string } | null
  weeklyTotals: Array<{ label: string; total: number }>
  /** Extra aggregates the story picker reads (`wrappedStories.ts`). Not sent to clients. */
  facts: WrappedFacts
}

type Span = { days: number; startDate: string; endDate: string }

export interface WrappedFacts {
  daysInMonth: number
  /** Entries the user logged themselves; recurring, subscription, balance-gap and transfer rows are left out. */
  selfLogged: { count: number; days: number; streak: Span | null; gap: Span | null; lateCount: number; scanCount: number }
  /** Most repeated item name, case and whitespace folded. */
  topItem: { item: string; count: number; total: number } | null
  medianAmount: number
  /** Entries at or under a quarter of the month's mean entry. */
  small: { count: number; total: number }
  /** Spend per calendar day, weekends vs weekdays, across the whole month. */
  perDay: { weekend: number; weekday: number }
  /** Monday-first weekday totals. */
  weekdayTotals: number[]
  /** Every category's total, not just the top five. */
  categoryTotals: Record<string, number>
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function emptyWrapped(month: string): WrappedData {
  return {
    month,
    range: { startDate: '', endDate: '', daysTracked: 0 },
    totalSpent: 0,
    totalTransactions: 0,
    topCategories: [],
    biggestPurchase: null,
    topWeekday: null,
    longestStreak: null,
    longestGap: null,
    weeklyTotals: [],
    facts: {
      daysInMonth: daysInMonth(month),
      selfLogged: { count: 0, days: 0, streak: null, gap: null, lateCount: 0, scanCount: 0 },
      topItem: null,
      medianAmount: 0,
      small: { count: 0, total: 0 },
      perDay: { weekend: 0, weekday: 0 },
      weekdayTotals: [0, 0, 0, 0, 0, 0, 0],
      categoryTotals: {},
    },
  }
}

const AUTOMATED_SOURCES = new Set(['recurring', 'subscription', 'balance_gap', 'transfer'])
const MS_PER_DAY = 24 * 60 * 60 * 1000

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** Longest run of consecutive dates, and the longest hole between two logged dates. `dates` sorted, distinct. */
function streakAndGap(dates: string[]): { streak: Span | null; gap: Span | null } {
  if (dates.length === 0) return { streak: null, gap: null }
  let streak: Span | null = null
  let gap: Span | null = null
  let runStart = dates[0]
  for (let i = 1; i <= dates.length; i++) {
    const prev = dates[i - 1]
    const current = dates[i]
    const step = current ? Math.round((new Date(current).getTime() - new Date(prev).getTime()) / MS_PER_DAY) : null
    if (current && step === 1) continue
    const runDays = Math.round((new Date(prev).getTime() - new Date(runStart).getTime()) / MS_PER_DAY) + 1
    if (!streak || runDays > streak.days) streak = { days: runDays, startDate: runStart, endDate: prev }
    if (current) {
      // Date difference, so 3 Sep then 10 Sep is a 7-day gap with 6 quiet days in it.
      if (!gap || step! > gap.days) gap = { days: step!, startDate: prev, endDate: current }
      runStart = current
    }
  }
  return { streak, gap }
}

/** Fixed day-of-month buckets — always 4 bars, no partial-week edge cases. */
const WEEK_BUCKETS = [
  { label: '1-7', from: 1, to: 7 },
  { label: '8-14', from: 8, to: 14 },
  { label: '15-21', from: 15, to: 21 },
  { label: '22-end', from: 22, to: 31 },
]

/** Compute a single month's "Wrapped" recap from raw expense docs (real spend only, refunds excluded). */
export function computeWrapped(docs: Row[], month: string): WrappedData {
  const rows = docs
    .map((r) => ({
      date: r.date,
      item: r.item,
      category: r.category,
      amountInr: Number(r.amount_inr) || 0,
      parsedDate: parseLocalDate(r.date),
      timestamp: String(r.timestamp ?? ''),
      source: String(r.source ?? ''),
    }))
    .filter((r) => !Number.isNaN(r.parsedDate.getTime()) && r.amountInr > 0 && r.date.slice(0, 7) === month && r.category !== CREDIT_CARD_CATEGORY && r.category !== INCOME_CATEGORY)
    .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime())

  if (rows.length === 0) return emptyWrapped(month)

  const distinctDates = [...new Set(rows.map((r) => r.date))].sort()
  const startDate = distinctDates[0]
  const endDate = distinctDates[distinctDates.length - 1]

  const totalSpent = rows.reduce((s, r) => s + r.amountInr, 0)

  const categoryTotals = new Map<string, number>()
  for (const r of rows) {
    categoryTotals.set(r.category, (categoryTotals.get(r.category) ?? 0) + r.amountInr)
  }
  const topCategories = [...categoryTotals.entries()]
    .map(([category, total]) => ({ category, total, pct: totalSpent > 0 ? (total / totalSpent) * 100 : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  const biggest = rows.reduce((max, r) => (r.amountInr > max.amountInr ? r : max), rows[0])
  const biggestPurchase = {
    item: biggest.item,
    amountInr: biggest.amountInr,
    category: biggest.category,
    date: biggest.date,
  }

  const weekdayTotals = new Map<number, { total: number; count: number }>()
  for (const r of rows) {
    const day = r.parsedDate.getDay()
    const entry = weekdayTotals.get(day) ?? { total: 0, count: 0 }
    entry.total += r.amountInr
    entry.count += 1
    weekdayTotals.set(day, entry)
  }
  const topWeekdayEntry = [...weekdayTotals.entries()].sort((a, b) => b[1].total - a[1].total)[0]
  const topWeekday = topWeekdayEntry
    ? { day: DAY_NAMES[topWeekdayEntry[0]], total: topWeekdayEntry[1].total, count: topWeekdayEntry[1].count }
    : null

  const { streak: longestStreak, gap: longestGap } = streakAndGap(distinctDates)

  const weeklyTotals = WEEK_BUCKETS.map((bucket) => ({
    label: bucket.label,
    total: rows
      .filter((r) => {
        const day = Number(r.date.slice(8, 10))
        return day >= bucket.from && day <= bucket.to
      })
      .reduce((s, r) => s + r.amountInr, 0),
  }))

  return {
    month,
    range: { startDate, endDate, daysTracked: distinctDates.length },
    totalSpent,
    totalTransactions: rows.length,
    topCategories,
    biggestPurchase,
    topWeekday,
    longestStreak,
    longestGap,
    weeklyTotals,
    facts: computeFacts(rows, month, totalSpent, categoryTotals, weekdayTotals),
  }
}

type FactRow = { date: string; item: string; amountInr: number; parsedDate: Date; timestamp: string; source: string }

function computeFacts(
  rows: FactRow[],
  month: string,
  totalSpent: number,
  categoryTotals: Map<string, number>,
  weekdayTotals: Map<number, { total: number; count: number }>,
): WrappedFacts {
  const self = rows.filter((r) => !AUTOMATED_SOURCES.has(r.source))
  const selfDates = [...new Set(self.map((r) => r.date))].sort()
  const { streak, gap } = streakAndGap(selfDates)
  // Timestamps are stored as the user's local wall time, so the hour is right there.
  const lateCount = self.filter((r) => {
    const hour = Number(r.timestamp.slice(11, 13))
    return /T\d\d:/.test(r.timestamp) && (hour >= 22 || hour < 2)
  }).length

  const items = new Map<string, { item: string; count: number; total: number }>()
  for (const r of rows) {
    const key = r.item.trim().toLowerCase()
    if (!key) continue
    const entry = items.get(key) ?? { item: r.item.trim(), count: 0, total: 0 }
    entry.count += 1
    entry.total += r.amountInr
    items.set(key, entry)
  }
  const topItem = [...items.values()].sort((a, b) => b.count - a.count || b.total - a.total)[0] ?? null

  const sorted = rows.map((r) => r.amountInr).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const medianAmount = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

  const smallLine = totalSpent / rows.length / 4
  const smallRows = rows.filter((r) => r.amountInr <= smallLine)

  const days = daysInMonth(month)
  let weekendDays = 0
  let weekendSpend = 0
  for (let d = 1; d <= days; d++) {
    const dow = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, d).getDay()
    if (dow === 0 || dow === 6) weekendDays++
  }
  for (const r of rows) {
    const dow = r.parsedDate.getDay()
    if (dow === 0 || dow === 6) weekendSpend += r.amountInr
  }

  return {
    daysInMonth: days,
    selfLogged: {
      count: self.length,
      days: selfDates.length,
      streak,
      gap,
      lateCount,
      scanCount: self.filter((r) => r.source === 'scan').length,
    },
    topItem,
    medianAmount,
    small: { count: smallRows.length, total: smallRows.reduce((s, r) => s + r.amountInr, 0) },
    perDay: { weekend: weekendSpend / weekendDays, weekday: (totalSpent - weekendSpend) / (days - weekendDays) },
    // getDay() is Sunday-first; stories read Monday-first.
    weekdayTotals: [1, 2, 3, 4, 5, 6, 0].map((d) => weekdayTotals.get(d)?.total ?? 0),
    categoryTotals: Object.fromEntries(categoryTotals),
  }
}
