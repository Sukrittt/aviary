import type { RecurringIncomeRow } from '@/src/types'
import { parseLocalDate } from '@/src/lib/date'

/**
 * The next pay to land, for a month it hasn't landed in yet. Until then
 * envelopes hold only what carried in (src/lib/envelope.ts `PAYCHECK_START`), so
 * Home says when the plan fills up. Twin of Mobile's src/lib/upcomingPay.ts.
 */
export function upcomingPayday(schedules: RecurringIncomeRow[]): RecurringIncomeRow | undefined {
  return schedules
    .filter((r) => r.status === 'active' && r.next_run_date)
    .sort((a, b) => a.next_run_date.localeCompare(b.next_run_date))[0]
}

/** "Nov 4". */
export function paydayLabel(date: string): string {
  return parseLocalDate(date).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

/** Add income as this month's starting balance, the bridge until `payday`. */
export function startingBalanceIntro(payday: string) {
  return `Your pay lands ${paydayLabel(payday)}. What do you have to spend till then?`
}
