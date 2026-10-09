import type { ExpenseRow } from '@/src/types'

/** The activity list's view shape, mapped from the wire rows. */
export interface Transaction {
  id: string
  version?: number
  timestamp: string
  date: string
  item: string
  amountInr: number
  category: string
  notes: string
  source: string
  /** '' when the row isn't on an account. */
  accountId: string
  hasPhoto: boolean
}

/**
 * Wire rows to the activity list's view shape. Pure: the rows come from
 * useExpenses, so this no longer fetches — the same split that turned
 * expensePanelLoader into buildExpensePanel.
 */
export function toTransactions(rows: ExpenseRow[]): Transaction[] {
  return rows.map((r) => ({
    id: r.id ?? '',
    version: r.version,
    timestamp: r.timestamp ?? '',
    date: r.date ?? '',
    item: r.item ?? '',
    amountInr: Number(r.amount_inr) || 0,
    category: r.category ?? '',
    notes: r.notes ?? '',
    source: r.source ?? '',
    accountId: r.account_id ?? '',
    hasPhoto: r.has_photo === true,
  }))
}