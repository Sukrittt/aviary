export type ExpenseField = 'amount' | 'item' | 'category'

/** Required log-expense fields still empty, in the order they sit on screen. */
export function missingFields(form: { amount: string; item: string; category: string }): ExpenseField[] {
  const missing: ExpenseField[] = []
  if (!(Number(form.amount) > 0)) missing.push('amount')
  if (!form.item.trim()) missing.push('item')
  if (!form.category) missing.push('category')
  return missing
}

const SINGLE: Record<ExpenseField, string> = {
  amount: 'Add an amount',
  item: 'Add what it was for',
  category: 'Pick a category',
}

/**
 * Toast copy for a blocked submit. Kept to one short line: a lone field gets
 * its full phrase, several collapse to nouns, e.g. "Add an amount and category".
 */
export function missingFieldsMessage(missing: ExpenseField[]): string {
  if (missing.length <= 1) return missing.length ? SINGLE[missing[0]] : ''
  const [first, ...rest] = missing
  const head = first === 'amount' ? 'an amount' : first === 'item' ? 'an item' : 'a category'
  const words = [head, ...rest]
  return `Add ${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}
