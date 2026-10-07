import { ExpenseWriteError } from '@/src/lib/expenseConflict'
import { apiFetch, HttpError } from './client'
import { nowIST } from '@/src/lib/date'
import type { CsvResponse, ExpenseRow } from '@/src/types'

export async function getExpenses(): Promise<ExpenseRow[]> {
  const resp = await apiFetch('/api/expenses')
  if (!resp.ok) throw new Error(`Failed to load expenses: ${resp.status}`)
  const data: CsvResponse<ExpenseRow> = await resp.json()
  return data.rows
}

export type RecentExpenses = { rows: ExpenseRow[]; lastSpent: Record<string, string> }

/** Rows dated on/after `from`, plus each category's all-time last spend date. */
export async function getRecentExpenses(from: string): Promise<RecentExpenses> {
  const resp = await apiFetch(`/api/expenses?from=${encodeURIComponent(from)}`)
  if (!resp.ok) throw new Error(`Failed to load expenses: ${resp.status}`)
  const data: CsvResponse<ExpenseRow> & { lastSpent?: Record<string, string> } = await resp.json()
  // An older server ignores `from` and sends everything, with no `lastSpent`;
  // the full rows already carry every last spend date, so {} is correct there.
  return { rows: data.rows, lastSpent: data.lastSpent ?? {} }
}

export type ExpensesPageParams = {
  page: number
  limit: number
  category?: string
  /** One of the user's accounts: only expenses paid from it. */
  account?: string
  from?: string
  to?: string
  q?: string
}

export type ExpensesPage = {
  rows: ExpenseRow[]
  total: number
  page: number
  pageCount: number
  totalAmount: number
}

/** Server-paginated read, for the Activity screen only — every other caller keeps using `getExpenses()`. */
export async function getExpensesPage(params: ExpensesPageParams): Promise<ExpensesPage> {
  const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit) })
  if (params.category) qs.set('category', params.category)
  if (params.account) qs.set('account', params.account)
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  if (params.q) qs.set('q', params.q)

  const resp = await apiFetch(`/api/expenses?${qs.toString()}`)
  if (!resp.ok) throw new Error(`Failed to load expenses: ${resp.status}`)
  const data: ExpensesPage = await resp.json()
  return data
}

export type NewExpenseRow = {
  item: string
  amount_inr: string
  category: string
  date?: string
  notes?: string
  payment_method?: string
  /** One of the user's accounts; the server takes the payment method from its type. */
  account_id?: string
  /**
   * Where it came from. Only manual entry completes the getting started
   * milestone; 'text' is a row confirmed from the money brain and
   * 'balance_gap' an estimate confirmed after a balance check.
   */
  source?: 'manual' | 'scan' | 'text' | 'balance_gap'
  /**
   * Set only when the caller already has a stable name for this create, like
   * a money-brain row (`capture:<proposalId>:<rowId>`), so logging the same
   * proposal again can never insert a second row. Minted fresh otherwise.
   */
  client_id?: string
}

/** The exact body a POST /api/expenses create sends, `client_id` included. */
export type ExpensePayload = NewExpenseRow & { client_id: string; date: string; timestamp: string }

/**
 * Mints the parts of a create that must be decided once, at capture time, and
 * never again: `client_id` names this create so a retry (offline queue, or a
 * lost response) is recognized as the same intent instead of inserting a
 * second row. `timestamp` is minted from the device's clock the same way the
 * server derives it (`date` + current IST time-of-day) so an expense logged
 * offline is dated the day it was actually logged, not the day the queue
 * happens to flush.
 */
export function mintExpensePayload(row: NewExpenseRow): ExpensePayload {
  const ist = nowIST()
  const date = row.date || ist.date
  return { ...row, date, timestamp: `${date}T${ist.timestamp.slice(11)}`, client_id: row.client_id || crypto.randomUUID() }
}

/** Resolves with the created (or, on a client_id replay, already-existing) row's identity. */
export async function postExpensePayload(payload: ExpensePayload): Promise<{ id?: string; timestamp?: string; version?: number }> {
  const resp = await apiFetch('/api/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new HttpError(resp.status, `Failed to add expense: ${resp.status}`)
  const data: { id?: string; timestamp?: string; version?: number } = await resp.json().catch(() => ({}))
  return { id: data.id, timestamp: data.timestamp, version: data.version }
}

/**
 * Resolves with the created row's identity. `id`/`timestamp` are optional
 * because an offline caller (useAddExpense) never gets this far — it mints
 * its own payload via `mintExpensePayload` up front so it has something to
 * enqueue if the POST itself never happens.
 */
export async function addExpense(row: NewExpenseRow): Promise<{ id?: string; timestamp?: string; version?: number }> {
  return postExpensePayload(mintExpensePayload(row))
}

/** Writes require the version returned when this expense was loaded. */
export async function updateExpense(
  id: string | undefined,
  timestamp: string,
  item: string,
  amountInr: number,
  updates: {
    new_item?: string
    new_amount_inr?: string
    new_date?: string
    new_payment_method?: string
    /** '' clears the account. */
    new_account_id?: string
    category?: string
  },
  version?: number,
): Promise<void> {
  const resp = await apiFetch('/api/expenses', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, timestamp, item, amount_inr: String(amountInr), version, ...updates }),
  })
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}))
    throw new ExpenseWriteError(resp.status, detail.error ?? `Failed to update expense: ${resp.status}`, detail.current)
  }
}

export async function updateExpenseCategory(
  id: string | undefined,
  timestamp: string,
  item: string,
  amountInr: number,
  category: string,
  version?: number,
): Promise<void> {
  await updateExpense(id, timestamp, item, amountInr, { category }, version)
}

export async function deleteExpense(
  id: string | undefined,
  timestamp: string,
  item: string,
  amountInr: number,
  version?: number,
): Promise<void> {
  const resp = await apiFetch('/api/expenses', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, timestamp, item, amount_inr: String(amountInr), version }),
  })
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}))
    throw new ExpenseWriteError(resp.status, detail.error ?? `Failed to delete expense: ${resp.status}`, detail.current)
  }
}

export type DuplicatePair = { duplicate: ExpenseRow; original: ExpenseRow }

/** Expenses the server flagged as likely logged twice, each with the row it seems to repeat. */
export async function getDuplicates(): Promise<DuplicatePair[]> {
  const resp = await apiFetch('/api/expenses/duplicates')
  if (!resp.ok) throw new Error(`Failed to load duplicates: ${resp.status}`)
  const data: { pairs: DuplicatePair[] } = await resp.json()
  return data.pairs
}

/** "Keep both": clears the flag so the pair is never offered again. */
export async function dismissDuplicate(id: string): Promise<void> {
  const resp = await apiFetch('/api/expenses/duplicates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!resp.ok) throw new HttpError(resp.status, `Failed to dismiss duplicate: ${resp.status}`)
}
