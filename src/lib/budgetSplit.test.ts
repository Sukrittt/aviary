import { describe, it, expect } from 'vitest'
import { allocate, bucketsOf, summarizeSplit, knownBucket, splitEvenly, suggestSplit, unknownCategories, type SplitItem } from './budgetSplit'

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

const defaults: SplitItem[] = [
  { key: 'rent', name: 'Rent', group: 'Essentials' },
  { key: 'groc', name: 'Groceries', group: 'Essentials' },
  { key: 'util', name: 'Utilities', group: 'Essentials' },
  { key: 'eat', name: 'Eating out', group: 'Lifestyle' },
  { key: 'ent', name: 'Entertainment', group: 'Lifestyle' },
  { key: 'ef', name: 'Emergency fund', group: 'Savings' },
]

describe('knownBucket', () => {
  it('tags the default categories by name, ignoring case and spaces', () => {
    expect(knownBucket(' rent ')).toBe('need')
    expect(knownBucket('Eating out')).toBe('want')
    expect(knownBucket('Investments')).toBe('savings')
  })

  it('returns null for a name it has never seen', () => {
    expect(knownBucket('Bhargav')).toBeNull()
  })
})

describe('allocate', () => {
  it('always adds up to the income exactly', () => {
    for (const income of [0, 7, 999, 3001, 61600, 123457]) {
      expect(sum(allocate(income, { a: 1, b: 1, c: 1 }))).toBe(income)
    }
  })

  it('rounds to a unit that fits the income size', () => {
    // 61,600 rounds to hundreds; the leftover lands on the biggest share.
    expect(allocate(61600, { a: 1, b: 1, c: 1 })).toEqual({ a: 20600, b: 20500, c: 20500 })
    // 3,000 rounds to tens.
    expect(allocate(3000, { a: 1, b: 1, c: 1 })).toEqual({ a: 1000, b: 1000, c: 1000 })
  })

  it('gives everything to zero-weight items evenly rather than dividing by zero', () => {
    expect(sum(allocate(1000, { a: 0, b: 0 }))).toBe(1000)
  })

  it('returns an empty split for no items', () => {
    expect(allocate(1000, {})).toEqual({})
  })
})

describe('suggestSplit', () => {
  it('splits needs, wants and savings 50/30/20', () => {
    const out = suggestSplit(100000, defaults, {})
    expect(out.rent + out.groc + out.util).toBe(50000)
    expect(out.eat + out.ent).toBe(30000)
    expect(out.ef).toBe(20000)
  })

  it('gives rent more than the other needs', () => {
    const out = suggestSplit(100000, defaults, {})
    expect(out.rent).toBeGreaterThan(out.groc)
    expect(out.groc).toBeGreaterThan(out.util)
  })

  it('shares a missing bucket out between the ones that are there', () => {
    // No savings: needs and wants keep their 50:30 ratio, 62.5% and 37.5%.
    const out = suggestSplit(80000, defaults.filter((d) => d.key !== 'ef'), {})
    expect(out.rent + out.groc + out.util).toBe(50000)
    expect(out.eat + out.ent).toBe(30000)
  })

  it('uses a Jev tag for a category it does not know', () => {
    const items: SplitItem[] = [
      { key: 'rent', name: 'Rent', group: 'Essentials' },
      { key: 'sip', name: 'Mutual fund SIP', group: 'Future' },
    ]
    const out = suggestSplit(70000, items, { 'mutual fund sip': 'savings' })
    expect(out).toEqual({ rent: 50000, sip: 20000 })
  })

  it('a default category name beats a Jev tag', () => {
    const out = suggestSplit(100, [{ key: 'r', name: 'Rent', group: 'Fun' }], { rent: 'want' })
    expect(out.r).toBe(100)
    expect(suggestSplit(80000, [
      { key: 'r', name: 'Rent', group: 'Fun' },
      { key: 'e', name: 'Eating out', group: 'Fun' },
    ], { rent: 'want' })).toEqual({ r: 50000, e: 30000 })
  })

  it('falls back to the group name, then to want', () => {
    const items: SplitItem[] = [
      { key: 'gym', name: 'Gym', group: 'Essentials' },
      { key: 'x', name: 'Bhargav', group: 'Bhargav' },
    ]
    expect(suggestSplit(80000, items, {})).toEqual({ gym: 50000, x: 30000 })
  })

  it('adds up to the income for any mix', () => {
    expect(sum(suggestSplit(61600, defaults, {}))).toBe(61600)
    expect(sum(suggestSplit(999, defaults, {}))).toBe(999)
  })
})

describe('splitEvenly', () => {
  it('gives each item the same share and adds up', () => {
    const out = splitEvenly(61600, ['a', 'b', 'c', 'd'])
    expect(out).toEqual({ a: 15400, b: 15400, c: 15400, d: 15400 })
  })
})

describe('unknownCategories', () => {
  it('lists only names the defaults do not cover, once each', () => {
    const items: SplitItem[] = [
      ...defaults,
      { key: 'a', name: 'Gym', group: 'Lifestyle' },
      { key: 'b', name: 'gym ', group: 'Health' },
    ]
    expect(unknownCategories(items)).toEqual([{ name: 'Gym', group: 'Lifestyle' }])
  })
})

describe('bucketsOf', () => {
  it('says which bucket each category landed in', () => {
    expect(bucketsOf([...defaults, { key: 'x', name: 'SIP', group: 'Future' }], { sip: 'savings' })).toEqual({
      rent: 'need', groc: 'need', util: 'need', eat: 'want', ent: 'want', ef: 'savings', x: 'savings',
    })
  })
})

describe('summarizeSplit', () => {
  it('gives each bucket its 50/30/20 share when all three are there', () => {
    expect(summarizeSplit(defaults, {})).toEqual([
      { bucket: 'need', pct: 50 },
      { bucket: 'want', pct: 30 },
      { bucket: 'savings', pct: 20 },
    ])
  })

  it('spreads a missing bucket over the rest', () => {
    expect(summarizeSplit(defaults.filter((d) => d.key !== 'ef'), {})).toEqual([
      { bucket: 'need', pct: 62.5 },
      { bucket: 'want', pct: 37.5 },
    ])
  })

  it('gives a lone bucket everything', () => {
    expect(summarizeSplit([{ key: 'r', name: 'Rent', group: 'Home' }], {})).toEqual([{ bucket: 'need', pct: 100 }])
  })

  it('is null for no categories', () => {
    expect(summarizeSplit([], {})).toBeNull()
  })
})
