/**
 * Recurring-investment due-date math. Pure, no I/O — same reasoning as
 * `subscriptions.ts`: usable from both the cron route and a future UI/test
 * without dragging in Mongo.
 */

export interface RecurringHolding {
  is_recurring: string
  /** Day of month (1-31) snapshotted once when recurring was turned on. */
  recurring_day: string
  /** 'YYYY-MM' of the last month a contribution was auto-applied. */
  recurring_last_run: string
}

/** Next eligible cron date, using the user's local calendar date. Missed dates aren't caught up. */
export function nextContributionDate(
  holding: RecurringHolding & { recurring_amount: string },
  today: string,
): string | null {
  const day = Number(holding.recurring_day)
  if (holding.is_recurring !== 'true' || !(Number(holding.recurring_amount) > 0)
    || !Number.isInteger(day) || day < 1 || day > 31) return null

  const current = new Date(`${today}T00:00:00Z`)
  if (Number.isNaN(current.getTime())) return null
  const dueInMonth = (offset: number) => {
    const first = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + offset, 1))
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
    first.setUTCDate(Math.min(day, last))
    return first.toISOString().slice(0, 10)
  }
  const due = dueInMonth(0)
  return due >= today && holding.recurring_last_run !== today.slice(0, 7) ? due : dueInMonth(1)
}

/** Last real day of `dateStr`'s month, so a `recurring_day: 31` holding still fires in a 30/28-day month. */
function lastDayOfMonth(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
}

function dayMatches(dateStr: string, recurringDay: number): boolean {
  const d = new Date(`${dateStr}T00:00:00Z`)
  return d.getUTCDate() === Math.min(recurringDay, lastDayOfMonth(dateStr))
}

/** 'YYYY-MM-DD' one calendar day after `dateStr`. */
export function tomorrowOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Whether `holding`'s monthly contribution should fire today, and hasn't already this month. */
export function isDueToday(holding: RecurringHolding, today: string): boolean {
  if (holding.is_recurring !== 'true') return false
  const day = Number(holding.recurring_day)
  if (!day) return false
  if (holding.recurring_last_run === today.slice(0, 7)) return false
  return dayMatches(today, day)
}

/** Whether `holding`'s monthly contribution is due tomorrow — for the day-before reminder push. */
export function isDueTomorrow(holding: RecurringHolding, today: string): boolean {
  if (holding.is_recurring !== 'true') return false
  const day = Number(holding.recurring_day)
  if (!day) return false
  return dayMatches(tomorrowOf(today), day)
}
