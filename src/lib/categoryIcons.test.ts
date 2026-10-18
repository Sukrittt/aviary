import { describe, expect, it } from 'vitest'
import { categoryIconKey, groupIconKey, searchCategoryIcons } from './categoryIcons'

describe('categoryIconKey', () => {
  it('prefers the picked icon over the emoji', () => {
    expect(categoryIconKey('🏠 Rent', 'Key')).toBe('Key')
  })

  it('ignores a picked icon outside the catalog', () => {
    expect(categoryIconKey('🏠 Rent', 'Nope')).toBe('House')
  })

  it('maps an embedded emoji, with or without the variation selector', () => {
    expect(categoryIconKey('🛍️ Shopping')).toBe('ShoppingBag')
    expect(categoryIconKey('🛍 Shopping')).toBe('ShoppingBag')
    expect(categoryIconKey('👨‍🍳 Cook')).toBe('CookingPot')
    expect(categoryIconKey('💇‍♂️ Haircut')).toBe('Scissors')
  })

  it("falls back to the name's words when there's no emoji", () => {
    expect(categoryIconKey('Fuel')).toBe('GasPump')
    expect(categoryIconKey('Gym membership')).toBe('Barbell')
  })

  it("falls back to the group, then the wallet", () => {
    expect(categoryIconKey('Zorblax', undefined, '🌱 Savings')).toBe('Plant')
    expect(categoryIconKey('Zorblax')).toBe('Wallet')
  })
})

describe('groupIconKey', () => {
  it('maps the emoji, then the name, then the folder', () => {
    expect(groupIconKey('🎬 Lifestyle')).toBe('FilmSlate')
    expect(groupIconKey('Savings')).toBe('PiggyBank')
    expect(groupIconKey('Zorblax')).toBe('FolderSimple')
  })
})

describe('searchCategoryIcons', () => {
  it('matches every word against names and tags', () => {
    expect(searchCategoryIcons('petrol')).toEqual(['GasPump'])
    expect(searchCategoryIcons('house')).toContain('House')
    expect(searchCategoryIcons('')).toContain('Wallet')
  })
})

describe('expanded catalog', () => {
  it('finds the newer icons by their tags', () => {
    expect(searchCategoryIcons('cricket')).toContain('Cricket')
    expect(searchCategoryIcons('upi')).toContain('ContactlessPayment')
    expect(searchCategoryIcons('yoga')).toContain('PersonSimpleTaiChi')
  })

  it("keeps name-only categories on the icons they had before", () => {
    expect(categoryIconKey('Laundry')).toBe('TShirt')
    expect(categoryIconKey('Kitchen')).toBe('CookingPot')
    expect(categoryIconKey('Fuel')).toBe('GasPump')
    expect(categoryIconKey('Work')).toBe('Laptop')
    expect(categoryIconKey('School')).toBe('GraduationCap')
  })
})
