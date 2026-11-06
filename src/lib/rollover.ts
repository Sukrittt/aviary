/**
 * The words for money that rolled in from last month. The amounts come from
 * the server (GET /api/budgets/carry, see lib/budgetCarry.ts); this only says
 * them. Twin of Mobile's src/lib/rollover.ts: keep the copy identical
 * (rolloverDetail is Web-only so far).
 */
import { CREDIT_CARD_CATEGORY, INCOME_CATEGORY, prevMonthKey, type Carry } from './envelope'
import type { BudgetRow } from '@/src/types'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "2026-10" -> "October". */
export function monthName(key: string): string {
  return MONTH_NAMES[Number(key.slice(5, 7)) - 1]
}

type Money = (amount: number) => string

/** An envelope's sub-line: "+₹95 from October" or "₹20 short from October". */
export function rolledOverLine(rolledOver: number, month: string, money: Money): string | null {
  if (!rolledOver) return null
  const from = monthName(prevMonthKey(month))
  return rolledOver > 0 ? `+${money(rolledOver)} from ${from}` : `${money(-rolledOver)} short from ${from}`
}

/**
 * The month-start strip: what rolled in, in one short line. Money left
 * unassigned counts as rolled over too (it's in Ready to Assign), and an
 * over-assigned month as short, so the line accounts for everything on its own.
 * Null when nothing rolled (including every month up to the rollover start,
 * where the server returns an empty carry).
 */
/**
 * The carry with this month's moves (a row's `rolled_over`) taken back out:
 * those aren't what rolled in, and money assigned before payday from a one-off
 * would otherwise read as rolled over and short at once.
 */
function rolledIn(carry: Carry, month: string, budgets: BudgetRow[]) {
  const rolled = { ...carry.rolled_over }
  let ready = carry.ready_to_assign
  for (const b of budgets) {
    const moved = b.month === month && b.category !== INCOME_CATEGORY ? Number(b.rolled_over) || 0 : 0
    if (!moved) continue
    rolled[b.category] = (rolled[b.category] ?? 0) - moved
    ready += moved
  }
  return { rolled, ready }
}

/**
 * Web-only line under the strip (Mobile has no twin yet): the parts of the
 * strip's totals that no spending row shows (goals, the card bill, money left
 * unassigned or over-assigned), so the strip can be checked against the rows.
 * Null when every amount is on a row.
 */
export function rolloverDetail(
  carry: Carry | undefined,
  month: string,
  money: Money,
  budgets: BudgetRow[] = [],
  goals: ReadonlySet<string> = new Set(),
): string | null {
  if (!carry) return null
  const { rolled, ready } = rolledIn(carry, month, budgets)
  const round = (n: number) => Math.round(n * 100) / 100
  const sum = (keep: (category: string) => boolean) =>
    round(Object.entries(rolled).filter(([c, n]) => keep(c) && n > 0).reduce((s, [, n]) => s + n, 0))
  // Past tense for Ready to Assign: it may well be assigned out again by now.
  const parts = [
    [sum((c) => goals.has(c)), 'in goals'],
    [sum((c) => c === CREDIT_CARD_CATEGORY), 'for the card bill'],
    [round(ready), 'that went to Ready to Assign'],
    // The short side's one part no row shows.
    [round(-ready), `over-assigned in ${monthName(prevMonthKey(month))}`],
  ] as const
  const shown = parts.filter(([n]) => n > 0).map(([n, what]) => `${money(n)} ${what}`)
  return shown.length ? `Includes ${shown.join(' · ')}` : null
}

export function rolloverCard(carry: Carry | undefined, month: string, money: Money, budgets: BudgetRow[] = []): string | null {
  if (!carry) return null
  const { rolled, ready } = rolledIn(carry, month, budgets)
  const amounts = [...Object.values(rolled), ready]
  const round = (n: number) => Math.round(n * 100) / 100
  const ahead = round(amounts.filter((n) => n > 0).reduce((s, n) => s + n, 0))
  const short = round(-amounts.filter((n) => n < 0).reduce((s, n) => s + n, 0))
  if (ahead && short) return `${money(ahead)} rolled over · ${money(short)} short`
  if (ahead) return `${money(ahead)} rolled over`
  if (short) return `${money(short)} short from ${monthName(prevMonthKey(month))}`
  return null
}
