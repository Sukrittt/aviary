/**
 * Export-only sheet/column readability layer for `lib/exports.ts`.
 *
 * Kept separate from `lib/models.ts` on purpose: the header arrays and
 * `toRow()` there also back the live `{ headers, rows }` app-data API routes
 * (expenses/budgets/subscriptions/holdings/holding-events/wrapped), so they
 * must keep returning raw snake_case values. This file only shapes what ends
 * up in the downloaded spreadsheet.
 */
import { formatCurrency } from '@/lib/currency'
import { resolveCurrency } from '@/src/lib/currencies'
import { COLLECTIONS } from '@/lib/models'

/** 'holding_events' -> 'Holding events' */
export function readableSheetName(name: string): string {
  const spaced = name.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function capitalizeWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

const moneyFor = (currencyCode: string) => (raw: unknown): string => {
  const value = Number(raw)
  return raw === undefined || raw === null || raw === '' || Number.isNaN(value) ? '' : formatCurrency(value, currencyCode)
}

const dateOnly = (raw: unknown): string => {
  if (!raw) return ''
  const d = new Date(String(raw))
  if (Number.isNaN(d.getTime())) return String(raw)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const dateTime = (raw: unknown): string => {
  if (!raw) return ''
  const d = new Date(String(raw))
  if (Number.isNaN(d.getTime())) return String(raw)
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`
}

const monthOnly = (raw: unknown): string => {
  if (!raw) return ''
  const [y, m] = String(raw).split('-').map(Number)
  if (!y || !m) return String(raw)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const yesNo = (raw: unknown): string => (String(raw) === 'true' ? 'Yes' : String(raw) === 'false' ? 'No' : '')

const plain = (raw: unknown): string => (raw === undefined || raw === null ? '' : String(raw))

/** Enum -> readable label, falling back to "snake_case" -> "Snake case" for anything unmapped. */
const label =
  (map: Record<string, string>) =>
  (raw: unknown): string => {
    const value = String(raw ?? '')
    if (value === '') return ''
    if (map[value]) return map[value]
    return capitalizeWord(value.replace(/_/g, ' '))
  }

export interface ExportColumn {
  key: string
  label: string
  format?: (raw: unknown) => string
}

// Only the collections with a fixed CSV-era header shape become a tab.
// ponytail: skips pushTokens/categoryMapOverrides/chatSessions/notificationLog/exports
// (no fixed columns, not user-facing budget data) — add a dynamic-header tab if
// users need those too.
export function exportColumns(currencyCode: string = 'INR'): Partial<Record<keyof typeof COLLECTIONS, ExportColumn[]>> {
  const code = resolveCurrency(currencyCode)
  const money = moneyFor(code)
  return {
  expenses: [
    { key: 'date', label: 'Date', format: dateOnly },
    { key: 'item', label: 'Item' },
    { key: 'amount_inr', label: `Amount (${code})`, format: money },
    { key: 'category', label: 'Category' },
    { key: 'notes', label: 'Notes' },
    { key: 'payment_method', label: 'Payment method', format: label({ bank: 'Bank', credit_card: 'Credit card' }) },
  ],
  budgets: [
    { key: 'month', label: 'Month', format: monthOnly },
    { key: 'category', label: 'Category' },
    { key: 'assigned', label: 'Assigned', format: money },
    { key: 'rolled_over', label: 'Rolled over', format: money },
    { key: 'extra', label: 'Extra income', format: money },
  ],
  categories: [
    { key: 'name', label: 'Name' },
    { key: 'group', label: 'Group' },
  ],
  groups: [{ key: 'name', label: 'Name' }],
  subscriptions: [
    { key: 'timestamp', label: 'Added on', format: dateTime },
    { key: 'service', label: 'Service' },
    { key: 'amount_inr', label: `Amount (${code})`, format: money },
    { key: 'billing_cycle', label: 'Billing cycle' },
    { key: 'next_due_date', label: 'Next due date', format: dateOnly },
    { key: 'status', label: 'Status', format: label({ active: 'Active', cancelled: 'Cancelled' }) },
    { key: 'renewal_or_end_month', label: 'Renewal / end month' },
    { key: 'notes', label: 'Notes' },
  ],
  holdings: [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    { key: 'value', label: 'Value', format: money },
    { key: 'updated_at', label: 'Updated', format: dateTime },
    { key: 'is_recurring', label: 'Recurring', format: yesNo },
    { key: 'recurring_amount', label: 'Recurring amount', format: money },
    { key: 'recurring_day', label: 'Recurring day', format: plain },
    { key: 'recurring_last_run', label: 'Last recurring run', format: monthOnly },
  ],
  holdingEvents: [
    { key: 'holding_name', label: 'Holding' },
    {
      key: 'event_type',
      label: 'Event type',
      format: label({ market_update: 'Market update', contribution: 'Contribution', withdrawal: 'Withdrawal' }),
    },
    { key: 'amount', label: 'Amount', format: money },
    { key: 'previous_value', label: 'Previous value', format: money },
    { key: 'new_value', label: 'New value', format: money },
    { key: 'timestamp', label: 'Date', format: dateTime },
  ],
}

}

/** Default INR shape retained for existing callers and fixtures. */
export const EXPORT_COLUMNS = exportColumns()
