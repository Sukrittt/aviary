/** Canonical wire values; money is stored as strings for field encryption. */
export function validMoney(value: unknown, allowNegative = false): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false
  const text = String(value).trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return false
  const n = Number(text)
  return Number.isFinite(n) && Math.abs(n) <= 1_000_000_000_000 && (allowNegative || n >= 0)
}
export function validMonth(value: unknown): value is string {
  return typeof value === 'string' && /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(value)
}
export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && validMonth(value.slice(0, 7)) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function validText(value: unknown, max: number, empty = false): value is string {
  return typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0)
}
export function expenseInputError(input: Record<string, unknown>, partial = false): string | null {
  for (const [field, max, empty] of [['item', 500, false], ['category', 100, false], ['notes', 5000, true]] as const) {
    if ((input[field] !== undefined || (!partial && field !== 'notes')) && !validText(input[field], max, empty)) return `invalid ${field}`
  }
  // Edits may correct an amount to zero (the transaction editor allows it); new expenses must be positive.
  if ((input.amount_inr !== undefined || !partial) && (!validMoney(input.amount_inr) || (!partial && Number(input.amount_inr) <= 0))) return 'amount must be a finite positive number'
  if (input.timestamp !== undefined && (typeof input.timestamp !== 'string' || !validDate(input.timestamp.slice(0, 10)) ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.test(input.timestamp) || !Number.isFinite(Date.parse(input.timestamp)))) return 'invalid timestamp'
  if (input.date !== undefined && !validDate(input.date)) return 'invalid date'
  if (input.payment_method !== undefined && !['bank', 'cash', 'credit_card'].includes(String(input.payment_method))) return 'invalid payment method'
  if (input.client_id !== undefined && !validText(input.client_id, 200)) return 'invalid client id'
  return null
}
