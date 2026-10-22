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

/** Ready to Assign's sub-line: "includes ₹5,000 from October" or "₹1,200 short from October". */
export function carriedReadyLine(carried: number, month: string, money: Money): string | null {
  if (!carried) return null
  const from = monthName(prevMonthKey(month))
  return carried > 0 ? `includes ${money(carried)} from ${from}` : `${money(-carried)} short from ${from}`
}

function envelopes(n: number): string {
  return n === 1 ? '1 envelope' : `${n} envelopes`
}

/**
 * The month-start card: what rolled in, non-zero parts only. Null when nothing
 * did (including every month up to the rollover start, where the server
 * returns an empty carry).
 */
export function rolloverCard(carry: Carry | undefined, month: string, money: Money): { title: string; lines: string[] } | null {
  if (!carry) return null
  const amounts = Object.values(carry.rolled_over).filter((n) => n !== 0)
  const ahead = amounts.filter((n) => n > 0)
  const short = amounts.filter((n) => n < 0)
  if (ahead.length === 0 && short.length === 0 && !carry.ready_to_assign) return null

  const sum = (ns: number[]) => Math.round(ns.reduce((s, n) => s + n, 0) * 100) / 100
  const first: string[] = []
  if (ahead.length) first.push(`${money(sum(ahead))} carried across ${envelopes(ahead.length)}`)
  if (carry.ready_to_assign > 0) first.push(`${money(carry.ready_to_assign)} to Ready to Assign`)
  if (carry.ready_to_assign < 0) first.push(`${money(-carry.ready_to_assign)} short in Ready to Assign`)
  const lines = first.length ? [first.join(' · ')] : []
  if (short.length) lines.push(`${money(-sum(short))} short in ${envelopes(short.length)}`)

  return { title: `${monthName(prevMonthKey(month))} rolled into ${monthName(month)}`, lines }
}
