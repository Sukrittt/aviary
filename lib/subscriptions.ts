/**
 * Subscription due-date math. Pure, no I/O — usable from both a React view
 * (`src/views/ExpensePage.tsx`) and a server route/cron, which is the point:
 * this logic used to live only inside a JSX closure and was unreachable from
 * a route handler.
 */

import { advance } from '@/lib/recurringExpense'

export interface DueDateInput {
  nextDueDate: string
  billingCycle: string
  renewalOrEndMonth?: string
  timestamp: string
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** 'YYYY-MM-DD' -> "24th September", for user-facing copy (push notifications, etc). */
export function formatReadableDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateStr
  const day = d.getUTCDate()
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  return `${day}${suffix} ${MONTH_NAMES[d.getUTCMonth()]}`
}

/**
 * Advances `dateStr` by one billing cycle, inferred from `cycle`'s free-form
 * text. A month-end date clamps to the short month, and `anchorDay` (the day
 * the subscription bills on) brings it back after: Jan 31, Feb 28, Mar 31.
 */
export function rollForward(dateStr: string, cycle: string, anchorDay?: number): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  const frequency = /yearly|annual/i.test(cycle) ? 'yearly' : /quarterly/i.test(cycle) ? 'quarterly' : /weekly/i.test(cycle) ? 'weekly' : 'monthly'
  return advance(d.toISOString().slice(0, 10), frequency, anchorDay)
}

/** Today as 'YYYY-MM-DD', UTC. */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Resolves the next date a subscription is due, in three tiers: a stored
 * `nextDueDate` rolled forward past `today`, then `renewalOrEndMonth`, then a
 * monthly cycle derived from the first-charge `timestamp`. Returns `''` if
 * none apply.
 *
 * `today` defaults to the real today ('YYYY-MM-DD', UTC) and only needs
 * overriding by a deterministic caller (the cron, tests). Comparisons are
 * calendar-date-only (`today`'s UTC midnight), not a live instant — a `d <=
 * new Date()` comparison would treat a subscription due *today* as already
 * past (today's midnight is always <= any later moment same day) and skip
 * straight to the next cycle, which is exactly the day this function most
 * needs to get right.
 */
export function getEffectiveDueDate(sub: DueDateInput, today: string = todayUTC()): string {
  const todayMidnight = new Date(`${today}T00:00:00Z`).getTime()
  if (sub.nextDueDate) {
    let d = new Date(sub.nextDueDate)
    if (Number.isNaN(d.getTime())) return ''
    const anchorDay = d.getUTCDate()
    while (d.getTime() < todayMidnight) {
      const rolled = rollForward(d.toISOString().slice(0, 10), sub.billingCycle, anchorDay)
      if (!rolled) break
      d = new Date(rolled)
    }
    return d.toISOString().slice(0, 10)
  }
  if (sub.renewalOrEndMonth) {
    const parts = sub.renewalOrEndMonth.split(' ')
    if (parts.length >= 2) {
      const m = MONTH_NAMES.indexOf(parts[0])
      const y = parseInt(parts[1])
      if (m >= 0 && !Number.isNaN(y)) return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
    }
  }
  if (sub.timestamp && /monthly/i.test(sub.billingCycle)) {
    const start = new Date(sub.timestamp)
    if (!Number.isNaN(start.getTime())) {
      const now = new Date(`${today}T00:00:00Z`)
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, start.getUTCDate()))
      if (next.getTime() <= todayMidnight) next.setUTCMonth(next.getUTCMonth() + 1)
      return next.toISOString().slice(0, 10)
    }
  }
  return ''
}

/**
 * Whole calendar days between today and `dateStr`, both compared at UTC
 * midnight — not a raw millisecond diff, which would round differently
 * depending on what time of day "now" happens to be (a bill "3 days out"
 * checked at 11pm and the same bill checked at 6am should both say 3).
 */
function calendarDaysUntil(dateStr: string, today: string = todayUTC()): number {
  const due = new Date(`${dateStr}T00:00:00Z`).getTime()
  const todayMidnight = new Date(`${today}T00:00:00Z`).getTime()
  return Math.round((due - todayMidnight) / 86400000)
}

/** Human-readable "renews in Nd" label, or '' if the date is missing or already past. */
export function daysUntil(dateStr: string): string {
  if (!dateStr) return ''
  const diff = calendarDaysUntil(dateStr)
  if (diff < 0) return ''
  if (diff === 0) return 'renews today'
  if (diff === 1) return 'renews tomorrow'
  return `renews in ${diff}d`
}

/** Days until the subscription's effective due date; `Infinity` for one-time or undated subscriptions. */
export function renewalDays(sub: DueDateInput & { billingCycle: string }, today: string = todayUTC()): number {
  if (/one-time/i.test(sub.billingCycle)) return Infinity
  const due = getEffectiveDueDate(sub, today)
  if (!due) return Infinity
  return calendarDaysUntil(due, today)
}

/** Statuses that should be treated as no-longer-billing — excluded from bill reminders and auto-added expenses. */
export const INACTIVE_STATUSES = new Set(['cancelled', 'canceled', 'ended', 'paused'])

/**
 * Whether `sub`'s next charge lands exactly on `today` — false for an
 * inactive status or a `one-time` billing cycle, neither of which should
 * ever auto-fire a recurring charge.
 */
export function isSubscriptionDueToday(
  sub: DueDateInput & { billingCycle: string; status?: string },
  today: string,
): boolean {
  if (sub.status && INACTIVE_STATUSES.has(sub.status.toLowerCase())) return false
  return renewalDays(sub, today) === 0
}
