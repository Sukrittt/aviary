import { describe, expect, it } from 'vitest'
import { missingFields, missingFieldsMessage } from './missingFields'

describe('missingFields', () => {
  it('lists every empty field in on-screen order', () => {
    expect(missingFields({ amount: '', item: '  ', category: '' })).toEqual(['amount', 'item', 'category'])
  })

  it('treats a zero amount as missing', () => {
    expect(missingFields({ amount: '0.', item: 'Milk', category: 'Groceries' })).toEqual(['amount'])
  })

  it('is empty for a complete form', () => {
    expect(missingFields({ amount: '450', item: 'Milk', category: 'Groceries' })).toEqual([])
  })
})

describe('missingFieldsMessage', () => {
  it('names a single field', () => {
    expect(missingFieldsMessage(['amount'])).toBe('Add an amount')
    expect(missingFieldsMessage(['item'])).toBe('Add what it was for')
    expect(missingFieldsMessage(['category'])).toBe('Pick a category')
  })

  it('joins two fields', () => {
    expect(missingFieldsMessage(['amount', 'category'])).toBe('Add an amount and category')
  })

  it('starts a pair with whichever field comes first', () => {
    expect(missingFieldsMessage(['item', 'category'])).toBe('Add an item and category')
  })

  it('joins three fields', () => {
    expect(missingFieldsMessage(['amount', 'item', 'category'])).toBe('Add an amount, item and category')
  })

  it('is empty when nothing is missing', () => {
    expect(missingFieldsMessage([])).toBe('')
  })
})
