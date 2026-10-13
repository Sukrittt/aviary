export type ExpenseField = 'amount' | 'category'

/**
 * Required log-expense fields still empty, in the order they sit on screen.
 * "What was it for?" isn't one: a blank item saves under the category's name.
 */
export function missingFields(form: { amount: string; category: string }): ExpenseField[] {
  const missing: ExpenseField[] = []
  if (!(Number(form.amount) > 0)) missing.push('amount')
  if (!form.category) missing.push('category')
  return missing
}

const SINGLE: Record<ExpenseField, string> = {
  amount: 'Add an amount',
  category: 'Pick a category',
}

/** Toast copy for a blocked submit, kept to one short line. */
export function missingFieldsMessage(missing: ExpenseField[]): string {
  if (missing.length > 1) return 'Add an amount and category'
  return missing.length ? SINGLE[missing[0]] : ''
}
