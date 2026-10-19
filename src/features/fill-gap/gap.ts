import type { NewExpenseRow } from '../../api/expenses'

/**
 * "Pick up where you left off": when someone's been away from logging for a
 * couple of days, offer to fill the gap from a statement, or to start fresh
 * with one rough total. No streaks and no guilt: it shows once per gap and
 * a dismissal is remembered against the date of the last expense.
 * Twin of Mobile's src/features/fill-gap/gap.ts.
 */

export const GAP_DAYS = 2
/** Stores the last-expense date the sheet was last shown for. */
export const GAP_SEEN_KEY = 'aviary-gap-seen'
export const FRESH_START_ITEM = 'Untracked spending'

const DAY_MS = 86_400_000
const dayNumber = (date: string) => Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS)
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/

/** The date of the last expense when the sheet should show for it, else null. `lastSpent` is per category, all-time. */
export function gapToFill(lastSpent: Record<string, string>, today: string, seen: string | null): string | null {
  const last = Object.values(lastSpent).filter((d) => d && d <= today).sort().at(-1)
  if (!last || last === seen) return null
  return dayNumber(today) - dayNumber(last) >= GAP_DAYS ? last : null
}

/**
 * The one expense "Start fresh" logs: today, so history stays as it was, and
 * money left stays honest. Keyed by the gap, so a double tap logs it once.
 */
export function freshStartExpense(amountText: string, category: string, since: string, today: string): NewExpenseRow | null {
  const text = amountText.replace(/,/g, '').trim()
  if (!category || !AMOUNT_RE.test(text) || Number(text) <= 0) return null
  return {
    item: FRESH_START_ITEM,
    amount_inr: String(Number(text)),
    category,
    date: today,
    notes: 'A rough total for the days you were away',
    source: 'fresh_start',
    client_id: `fresh:${since}`,
  }
}

/** A statement row the user kept. Its client_id is the server's hash, so uploading the same file again adds nothing. */
export function statementExpense(row: { id: string; item: string; amount: number; date: string }, category: string): NewExpenseRow {
  return { item: row.item, amount_inr: String(row.amount), category, date: row.date, source: 'statement', client_id: row.id }
}

export function creditsLine(n: number): string | null {
  if (n <= 0) return null
  return `${n} ${n === 1 ? 'credit' : 'credits'} skipped. Log refunds as income if you want them counted.`
}
