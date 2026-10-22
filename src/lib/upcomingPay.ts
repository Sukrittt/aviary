import type { RecurringIncomeRow } from '@/src/types'
import { parseLocalDate } from '@/src/lib/date'

/**
 * A monthly pay that hasn't started counting yet. Someone who signs up
 * mid-month enters their next payday, and a monthly income only counts from
 * the month its first payday is in (lib/income.ts `countsIn`), so this
 * month's Ready to Assign stays at 0 until they add what they have now.
 * Twin of Mobile's src/lib/upcomingPay.ts.
 */
export function upcomingMonthlyPay(schedules: RecurringIncomeRow[], month: string): RecurringIncomeRow | undefined {
  return schedules
    .filter((r) => r.frequency === 'monthly' && r.status === 'active' && r.start_date.slice(0, 7) > month)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
}

/** "Nov 4". */
export function paydayLabel(date: string): string {
  return parseLocalDate(date).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

/** Add income as this month's starting balance, the bridge until `payday`. */
export function startingBalanceIntro(payday: string) {
  return `Your pay lands ${paydayLabel(payday)}. What do you have to spend till then?`
}
