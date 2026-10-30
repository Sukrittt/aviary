import { describe, expect, it } from 'vitest'
import { matchCategory } from './matchCategory'

const WORDS = { uber: 'Transport', dinner: 'Food', lunch: 'Food', rent: 'Rent' }
const CATEGORIES = ['Transport', 'Food', 'Rent']

describe('matchCategory', () => {
  it('takes the category most words point to, not the first word', () => {
    expect(matchCategory('uber dinner lunch', WORDS, CATEGORIES)).toBe('Food')
  })

  it('takes the first one on a tie', () => {
    expect(matchCategory('uber dinner', WORDS, CATEGORIES)).toBe('Transport')
  })

  it('finds a renamed category by partial name', () => {
    expect(matchCategory('dinner', WORDS, ['Transport', '🍔 Food & Dining'])).toBe('🍔 Food & Dining')
  })

  it('counts a renamed category together with its votes', () => {
    expect(matchCategory('uber dinner lunch', WORDS, ['Transport', 'Food & Dining'])).toBe('Food & Dining')
  })

  it('ignores a word whose category is gone', () => {
    expect(matchCategory('rent', WORDS, ['Transport', 'Food'])).toBe('')
  })

  it('finds nothing in an unknown or empty description', () => {
    expect(matchCategory('xyz', WORDS, CATEGORIES)).toBe('')
    expect(matchCategory('   ', WORDS, CATEGORIES)).toBe('')
  })

  it("doesn't trip on words that name Object's own properties", () => {
    expect(matchCategory('constructor', WORDS, CATEGORIES)).toBe('')
  })
})
