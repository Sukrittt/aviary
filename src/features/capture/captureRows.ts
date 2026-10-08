import type { CaptureProposal } from '@/src/api/ai'
import type { NewExpenseRow } from '@/src/api/expenses'
import { round2 } from '@/src/lib/split'

/**
 * The editable state behind one row of the money brain's review card, plus
 * the rules for turning it into an expense. Kept out of the component so the
 * money math and the client_id rule are testable on their own.
 */
export interface CaptureRow {
  id: string
  item: string
  /** The total as typed, so a half-edited amount ("12.") survives re-renders. */
  amountText: string
  splitWays: number
  date: string
  category: string
  paymentMethod?: 'bank' | 'credit_card'
  removed: boolean
}

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/

export function toRows(proposal: CaptureProposal): CaptureRow[] {
  return proposal.items.map((i) => ({
    id: i.id,
    item: i.item,
    amountText: String(i.amount),
    splitWays: i.splitWays > 1 ? i.splitWays : 1,
    date: i.date,
    category: i.category,
    ...(i.paymentMethod ? { paymentMethod: i.paymentMethod } : {}),
    removed: false,
  }))
}

/** The total paid, or NaN while the typed amount isn't a valid positive number. */
export function rowTotal(row: CaptureRow): number {
  const text = row.amountText.trim()
  if (!AMOUNT_RE.test(text)) return NaN
  const n = Number(text)
  return n > 0 ? n : NaN
}

/** What the user actually spent: their share of a split, to the paisa. */
export function rowShare(row: CaptureRow): number {
  return round2(rowTotal(row) / row.splitWays)
}

export function keptRows(rows: CaptureRow[]): CaptureRow[] {
  return rows.filter((r) => !r.removed)
}

/** A row the user still has to fix before it can be logged. */
export function rowIncomplete(row: CaptureRow): boolean {
  return !row.item.trim() || !row.category || Number.isNaN(rowTotal(row))
}

export function canLog(rows: CaptureRow[]): boolean {
  const kept = keptRows(rows)
  return kept.length > 0 && kept.every((r) => !rowIncomplete(r))
}

/** Rows whose name, amount or envelope differ from what the money brain read, for analytics. */
export function editedCount(rows: CaptureRow[], proposal: CaptureProposal): number {
  return keptRows(rows).filter((r) => {
    const original = proposal.items.find((i) => i.id === r.id)
    return !original || original.item !== r.item.trim() || original.amount !== rowTotal(r) || original.category !== r.category
  }).length
}

/** Where a reviewed row came from, which sets its source and names its client_id. */
export interface RowOrigin {
  source: 'text' | 'balance_gap'
  /** `capture` for money-brain rows, `gap` for balance-check estimates. */
  clientIdPrefix: string
}

export const CAPTURE_ORIGIN: RowOrigin = { source: 'text', clientIdPrefix: 'capture' }
export const GAP_ORIGIN: RowOrigin = { source: 'balance_gap', clientIdPrefix: 'gap' }

/**
 * The expense a row becomes. Its client_id is fixed by the proposal and row
 * ids, so logging the same card again (a double tap, a retry, a chat reopened
 * later) is recognized server-side and never inserts a second row.
 */
export function rowToExpense(
  proposalId: string,
  row: CaptureRow,
  formatTotal: (amount: number) => string,
  origin: RowOrigin = CAPTURE_ORIGIN,
): NewExpenseRow {
  const notes =
    row.splitWays > 1
      ? `Split ${row.splitWays} ways · ${formatTotal(rowTotal(row))} total`
      : origin.source === 'balance_gap'
        ? 'Estimated from a balance check'
        : undefined
  return {
    item: row.item.trim(),
    amount_inr: String(rowShare(row)),
    category: row.category,
    date: row.date,
    ...(notes ? { notes } : {}),
    ...(row.paymentMethod ? { payment_method: row.paymentMethod } : {}),
    source: origin.source,
    client_id: `${origin.clientIdPrefix}:${proposalId}:${row.id}`,
  }
}
