import type { NewExpenseRow } from '../../api/expenses'
import { formatDateShort } from '../../lib/format'

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
  const raw = amountText.trim()
  // "12,50" is twelve and a half; "1,250" and "1,25,000" are grouped thousands.
  const text = /^\d+,\d{1,2}$/.test(raw) ? raw.replace(',', '.') : raw.replace(/,/g, '')
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

/**
 * "Split it": the rough total across categories, one expense today for each,
 * so every category's money left stays honest. A category picked twice adds
 * up (in paise). Blank rows are skipped; a half-filled one, or none at all,
 * logs nothing. Each is keyed by the gap and its category, so a retry after
 * a partly failed save logs only what's missing.
 */
export function freshStartSplit(rows: { amount: string; category: string }[], since: string, today: string): NewExpenseRow[] | null {
  const paise = new Map<string, number>()
  for (const row of rows) {
    if (!row.amount.trim() && !row.category) continue
    const one = freshStartExpense(row.amount, row.category, since, today)
    if (!one) return null
    paise.set(one.category, (paise.get(one.category) ?? 0) + Math.round(Number(one.amount_inr) * 100))
  }
  if (!paise.size) return null
  return [...paise].map(([category, p]) => ({
    ...freshStartExpense(String(p / 100), category, since, today)!,
    client_id: `fresh:${since}:${category}`,
  }))
}

/** A statement row the user kept. Its client_id is the server's hash, so uploading the same file again adds nothing. */
export function statementExpense(row: { id: string; item: string; amount: number; date: string }, category: string): NewExpenseRow {
  return { item: row.item, amount_inr: String(row.amount), category, date: row.date, source: 'statement', client_id: row.id }
}

export function creditsLine(n: number): string | null {
  if (n <= 0) return null
  return `${n} ${n === 1 ? 'credit' : 'credits'} skipped. Log refunds as income if you want them counted.`
}

/** The days a review covers: "16 Oct", "16 to 19 Oct", "28 Sept to 3 Oct". */
export function daySpan(from: string, to: string): string {
  if (from === to) return formatDateShort(from)
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  return `${sameMonth ? Number(from.slice(8, 10)) : formatDateShort(from)} to ${formatDateShort(to)}`
}

export type CaughtUp = { count: number; total: number; from: string; to: string; categories: { name: string; total: number }[] }

/** What the "You're caught up" screen says about the rows just logged. Summed in paise, so ₹0.10 + ₹0.20 is ₹0.30. */
export function caughtUp(kept: { amount: number; date: string; category: string }[]): CaughtUp {
  const paise = new Map<string, number>()
  let total = 0
  for (const row of kept) {
    const p = Math.round(row.amount * 100)
    total += p
    paise.set(row.category, (paise.get(row.category) ?? 0) + p)
  }
  const dates = kept.map((r) => r.date).sort()
  return {
    count: kept.length,
    total: total / 100,
    from: dates[0] ?? '',
    to: dates.at(-1) ?? '',
    categories: [...paise].sort((a, b) => b[1] - a[1]).map(([name, p]) => ({ name, total: p / 100 })),
  }
}

/** Review rows under their day, oldest day first, each day in the order it came. */
export function byDay<T extends { date: string }>(rows: T[]): { date: string; rows: T[] }[] {
  const days = new Map<string, T[]>()
  for (const row of rows) days.set(row.date, [...(days.get(row.date) ?? []), row])
  return [...days].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([date, rows]) => ({ date, rows }))
}
