/**
 * Recurring-expense schedule math. Pure, no I/O — same reasoning as
 * `subscriptions.ts` and `holdingRecurrence.ts`: the cron
 * (`app/api/notifications/run`), the CRUD route and the tests all need this,
 * and none of them should drag in Mongo to get it.
 *
 * Two things this does that the two older engines don't:
 *
 * 1. **It backfills.** `isSubscriptionDueToday` / `isDueToday` fire only on an
 *    exact match with today, so a skipped cron run loses that period for good.
 *    `occurrencesDue` returns *every* occurrence from `next_run_date` through
 *    today, so each missed date still gets logged on its own date.
 * 2. **Monthly clamps without drifting.** `subscriptions.ts::rollForward` uses
 *    raw `Date` setters, so a 31st recurrence overflows Jan 31 → Mar 3. Here a
 *    short month clamps to its last day, and the *anchor* day (from
 *    `start_date`) is what the next step is computed from — so Jan 31 →
 *    Feb 28 → Mar 31, not Feb 28 → Mar 28.
 *
 * Dates are 'YYYY-MM-DD' compared at UTC midnight, never a live instant — the
 * bug `subscriptions.ts` documents at length, where a recurrence due *today*
 * reads as already past.
 */

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'yearly']

/**
 * Ceiling on how many occurrences one run will backfill for one recurrence.
 * A corrupt `next_run_date` (a daily recurrence stamped 2019) would otherwise
 * spin for thousands of iterations and dump thousands of expenses.
 */
export const MAX_BACKFILL = 500

export interface RecurringExpenseSchedule {
  frequency: string
  start_date: string
  end_date: string
  next_run_date: string
  status: string
}

function parse(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const d = new Date(`${dateStr}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Last real day of the month `d` lands in — so a day-31 recurrence still fires in a 30/28-day month. */
function lastDayOfMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
}

/** `dateStr` moved `months` months on, with the day clamped to `anchorDay` or the month's last day. */
function addMonths(d: Date, months: number, anchorDay: number): string {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1))
  target.setUTCDate(Math.min(anchorDay, lastDayOfMonth(target)))
  return iso(target)
}

/**
 * The occurrence after `dateStr`. `anchorDay` is the day-of-month the
 * recurrence was created on (from `start_date`); it only matters for
 * monthly/yearly, and defaults to `dateStr`'s own day. Returns `dateStr`
 * unchanged for an unparseable date or an unknown frequency — callers treat
 * "didn't move" as a stop condition rather than looping forever.
 */
export function advance(dateStr: string, frequency: string, anchorDay?: number): string {
  const d = parse(dateStr)
  if (!d) return dateStr
  const anchor = anchorDay ?? d.getUTCDate()

  switch (frequency) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1)
      return iso(d)
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7)
      return iso(d)
    case 'monthly':
      return addMonths(d, 1, anchor)
    case 'quarterly':
      return addMonths(d, 3, anchor)
    case 'yearly':
      return addMonths(d, 12, anchor)
    default:
      return dateStr
  }
}

/**
 * Every occurrence owed as of `today`, oldest first — `next_run_date` through
 * `today` inclusive, stopping at `end_date`. This is the backfill: a weekly
 * recurrence dormant for three weeks returns three dates.
 *
 * Empty unless the recurrence is `active`, so a paused or ended one silently
 * accrues nothing.
 */
export function occurrencesDue(rec: RecurringExpenseSchedule, today: string): string[] {
  if (rec.status !== 'active') return []
  if (!parse(rec.next_run_date) || !parse(today)) return []

  const anchor = parse(rec.start_date)?.getUTCDate()
  const due: string[] = []
  let cursor = rec.next_run_date

  while (due.length < MAX_BACKFILL && cursor <= today) {
    if (rec.end_date && cursor > rec.end_date) break
    due.push(cursor)
    const next = advance(cursor, rec.frequency, anchor)
    if (next === cursor) break // unknown frequency — don't spin
    cursor = next
  }

  return due
}

/**
 * The expense `payment_method` a recurrence logs with. The route only stores
 * 'bank' or 'credit_card', but rows written around it (a seed script left
 * 'Debit Card' and 'Bank Transfer' in prod) carry free-text labels that
 * `createExpense` rejects. Read those as the route's own default, 'bank',
 * rather than failing the occurrence every night.
 */
export function paymentMethodOf(value: unknown): 'bank' | 'credit_card' {
  return /^credit[\s_-]*card$/i.test(String(value ?? '').trim()) ? 'credit_card' : 'bank'
}

/** Whether `end_date` is strictly behind `today`, i.e. the recurrence is done. */
export function isExpired(rec: Pick<RecurringExpenseSchedule, 'end_date'>, today: string): boolean {
  return Boolean(rec.end_date) && rec.end_date < today
}

/**
 * The first occurrence on or after `today` for a recurrence starting at
 * `startDate`. Creating a recurrence with a backdated start should schedule it
 * forward, not instantly backfill history the user never asked for — the
 * backfill in `occurrencesDue` exists for runs the cron *missed*, not for
 * dates that predate the recurrence itself.
 */
export function firstRunOnOrAfter(startDate: string, frequency: string, today: string): string {
  if (!parse(startDate)) return startDate
  const anchor = parse(startDate)!.getUTCDate()

  let cursor = startDate
  for (let i = 0; i < MAX_BACKFILL && cursor < today; i++) {
    const next = advance(cursor, frequency, anchor)
    if (next === cursor) break
    cursor = next
  }
  return cursor
}
