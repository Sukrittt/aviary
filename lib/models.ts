/**
 * Mongo document models + CSV header arrays.
 *
 * Documents are stored with the same snake_case field names as the legacy CSV
 * headers, so the existing client mapping in `src/services/api.ts` and the
 * `{ headers, rows }` response shapes need no changes.
 */

export const EXPENSE_HEADERS = [
  'timestamp',
  'date',
  'item',
  'amount_inr',
  'category',
  'notes',
  'source',
  'amount',
  'description',
  'payment_method',
]

// An expense document may also carry `client_id` (a UUID minted on the device
// that created it), so a retried offline create is recognized before it
// inserts a second row. Deliberately not in EXPENSE_HEADERS above — that
// array doubles as the CSV export's column set, and adding a field would
// change every export. Guarded by a partial unique index on
// `{ user_id, client_id }` (scripts/ensure-indexes.mjs), optional on legacy rows.

export const BUDGET_HEADERS = ['month', 'category', 'assigned', 'rolled_over', 'extra']

export const CATEGORY_HEADERS = ['name', 'group']

export const GROUP_HEADERS = ['name']

export const SUBSCRIPTION_HEADERS = [
  'timestamp',
  'service',
  'amount_inr',
  'billing_cycle',
  'next_due_date',
  'status',
  'renewal_or_end_month',
  'notes',
  'category',
]

// Rows are addressed by `_id`, not by name the way `subscriptions` uses
// `service` — `item` is encrypted (see lib/encryptedFields.ts) and an
// encrypted field can't be used as a filter.
export const RECURRING_EXPENSE_HEADERS = [
  'item',
  'amount_inr',
  'category',
  'notes',
  'payment_method',
  'frequency', // daily | weekly | monthly | yearly
  'start_date', // YYYY-MM-DD, first occurrence
  'end_date', // YYYY-MM-DD or '' — optional expiry
  'next_run_date', // YYYY-MM-DD, next occurrence not yet logged
  'status', // active | paused | ended
  'created_at',
]

export const HOLDING_HEADERS = [
  'name',
  'type',
  'value',
  'updated_at',
  'is_recurring',
  'recurring_amount',
  'recurring_day',
  'recurring_last_run',
]

export const HOLDING_EVENT_HEADERS = [
  'holding_name',
  'event_type',
  'amount',
  'previous_value',
  'new_value',
  'timestamp',
]

/** Base (non-demo) collection names, mirroring the legacy CSV file stems. */
export const COLLECTIONS = {
  expenses: 'expenses',
  budgets: 'budgets',
  categories: 'categories',
  groups: 'groups',
  subscriptions: 'subscriptions',
  recurringExpenses: 'recurring_expenses',
  holdings: 'holdings',
  holdingEvents: 'holding_events',
  pushTokens: 'push_tokens',
  categoryMapOverrides: 'category_map_overrides',
  chatSessions: 'chat_sessions',
  notificationLog: 'notification_log',
  exports: 'exports',
  billScans: 'bill_scans',
  recurringDetection: 'recurring_detection',
} as const

/** One CSV-ish row; every value is a string so it round-trips exactly. */
export type Row = Record<string, string>

/**
 * Project a stored Mongo doc onto a full header-shaped row, defaulting missing
 * fields to '' — the same behaviour the CSV `{ headers, rows }` API produced.
 */
export function toRow(headers: string[], doc: Record<string, unknown>): Row {
  const row: Row = {}
  for (const header of headers) {
    const value = doc[header]
    row[header] = value === undefined || value === null ? '' : String(value)
  }
  return row
}
