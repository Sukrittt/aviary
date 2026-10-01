import type { ExpenseRow } from '@/src/types'

const WINDOW_DAYS = 90
const MIN_SAMPLES = 8
const MIN_RATIO = 5

/**
 * Catches a likely typo (an extra zero) before an expense is saved: the amount
 * is at least 5x the category's median over the last 90 days *and* bigger than
 * anything logged there in that window. Needs 8 past rows so a new category
 * never nags. Returns null when the amount looks normal.
 */
export function unusualAmount(
  amount: number,
  category: string,
  expenses: ExpenseRow[],
  today: string,
): { typical: number; ratio: number } | null {
  if (!(amount > 0) || !category) return null
  const from = new Date(`${today}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - WINDOW_DAYS)
  const start = from.toISOString().slice(0, 10)

  const past = expenses
    .filter((e) => e.category === category && e.date.slice(0, 10) >= start && e.date.slice(0, 10) <= today)
    .map((e) => Number(e.amount_inr))
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
  if (past.length < MIN_SAMPLES || amount <= past[past.length - 1]) return null

  const mid = past.length >> 1
  const typical = past.length % 2 ? past[mid] : (past[mid - 1] + past[mid]) / 2
  const ratio = amount / typical
  return ratio >= MIN_RATIO ? { typical, ratio: Math.round(ratio) } : null
}
