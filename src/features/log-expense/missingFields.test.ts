import { describe, expect, it } from 'vitest'
import { missingFields, missingFieldsMessage } from './missingFields'

describe('missingFields', () => {
  it('lists every empty field in on-screen order', () => {
    expect(missingFields({ amount: '', category: '' })).toEqual(['amount', 'category'])
  })

  it('treats a zero amount as missing', () => {
    expect(missingFields({ amount: '0.', category: 'Groceries' })).toEqual(['amount'])
  })

  it('is empty for a complete form', () => {
    expect(missingFields({ amount: '450', category: 'Groceries' })).toEqual([])
  })
})

describe('missingFieldsMessage', () => {
  it('names a single field', () => {
    expect(missingFieldsMessage(['amount'])).toBe('Add an amount')
    expect(missingFieldsMessage(['category'])).toBe('Pick a category')
  })

  it('joins both fields', () => {
    expect(missingFieldsMessage(['amount', 'category'])).toBe('Add an amount and category')
  })

  it('is empty when nothing is missing', () => {
    expect(missingFieldsMessage([])).toBe('')
  })
})
