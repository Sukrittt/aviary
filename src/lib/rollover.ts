/**
 * The words for money that rolled in from last month. The amounts come from
 * the server (GET /api/budgets/carry, see lib/budgetCarry.ts); this only says
 * them. Twin of Mobile's src/lib/rollover.ts: keep the copy identical.
 */
import { prevMonthKey, type Carry } from './envelope'

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
export function rolloverCard(carry: Carry | undefined, month: string, money: Money): string | null {
  if (!carry) return null
  const amounts = [...Object.values(carry.rolled_over), carry.ready_to_assign]
  const round = (n: number) => Math.round(n * 100) / 100
  const ahead = round(amounts.filter((n) => n > 0).reduce((s, n) => s + n, 0))
  const short = round(-amounts.filter((n) => n < 0).reduce((s, n) => s + n, 0))
  if (ahead && short) return `${money(ahead)} rolled over · ${money(short)} short`
  if (ahead) return `${money(ahead)} rolled over`
  if (short) return `${money(short)} short from ${monthName(prevMonthKey(month))}`
  return null
}
