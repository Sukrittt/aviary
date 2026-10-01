// Row shapes as the API returns them: these are the exact field names on the
// wire, so nothing reshapes between the API and the query hooks. Twin of
// Mobile/src/types/index.ts.

export interface CsvResponse<T> {
  headers: string[]
  rows: T[]
}

export interface BudgetRow {
  month: string
  category: string
  assigned: string
  rolled_over: string
  /** Only on the income row: one-off income for that month. See EnvelopeState.incomeExtra. */
  extra?: string
  version: number
}

export interface ExpenseRow {
  version?: number
  id?: string
  timestamp: string
  date: string
  item: string
  amount_inr: string
  category: string
  notes: string
  source: string
  amount: string
  description: string
  payment_method: string
}

export interface CategoryRow {
  name: string
  group: string
  alertPcts?: number[]
}

export interface CategoryMap {
  words: Record<string, string>
  updatedAt: string
}

export interface SubscriptionRow {
  timestamp: string
  service: string
  amount_inr: string
  billing_cycle: string
  next_due_date: string
  status: string
  renewal_or_end_month: string
  notes: string
  category: string
}

/**
 * A recurring expense the server auto-logs on each due date. Addressed by `id`,
 * not by name the way SubscriptionRow uses `service` — `item` is encrypted
 * server-side and can't be a lookup key.
 *
 * `next_run_date` is computed and advanced entirely by the server. Don't
 * recompute it on the device: `SubscriptionsPanel`'s local fork of the
 * subscription due-date math rolls against a live instant instead of UTC
 * midnight, so anything due *today* reads as next cycle there.
 */
export interface RecurringExpenseRow {
  id: string
  item: string
  amount_inr: string
  category: string
  notes: string
  payment_method: string
  frequency: string
  start_date: string
  end_date: string
  next_run_date: string
  status: string
  created_at: string
}

export interface HoldingRow {
  name: string
  type: string
  value: string
  updated_at: string
  is_recurring: string
  recurring_amount: string
  recurring_day: string
  recurring_last_run: string
  version: number
}

export interface HoldingEventRow {
  holding_name: string
  event_type: string
  amount: string
  previous_value: string
  new_value: string
  timestamp: string
}
