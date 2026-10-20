import { describe, it, expect, vi } from 'vitest'
import { getCachedCategoryMap, invalidateCategoryMap, buildCategoryMap, learnCategoryCorrection } from './categoryMap'
import type { ScopedCollection } from './scoped'

function fakeExpensesCollection(rows: Array<{ item: string; category: string; timestamp?: string }>) {
  return {
    find: vi.fn(() => ({ toArray: async () => rows })),
  } as unknown as ScopedCollection
}

describe('getCachedCategoryMap / invalidateCategoryMap (C9)', () => {
  it('builds the map once and reuses it on a second call with the same userId', async () => {
    const userId = `user_${Math.random()}`
    const coll = fakeExpensesCollection([{ item: 'Swiggy dinner', category: 'Food' }])

    const first = await getCachedCategoryMap(userId, coll)
    const second = await getCachedCategoryMap(userId, coll)

    expect(coll.find).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('rebuilds after invalidateCategoryMap — the bug this fixes: a stale cache never refreshing', async () => {
    const userId = `user_${Math.random()}`
    const coll = fakeExpensesCollection([{ item: 'Swiggy dinner', category: 'Food' }])

    await getCachedCategoryMap(userId, coll)
    invalidateCategoryMap(userId)
    await getCachedCategoryMap(userId, coll)

    expect(coll.find).toHaveBeenCalledTimes(2)
  })

  it('keeps different users independent', async () => {
    const collA = fakeExpensesCollection([{ item: 'A', category: 'Food' }])
    const collB = fakeExpensesCollection([{ item: 'B', category: 'Rent' }])

    await getCachedCategoryMap('user_a_isolated', collA)
    await getCachedCategoryMap('user_b_isolated', collB)

    expect(collA.find).toHaveBeenCalledTimes(1)
    expect(collB.find).toHaveBeenCalledTimes(1)
  })
})

describe('buildCategoryMap', () => {
  it('picks the majority category per word, and lets overrides win on conflicts', async () => {
    const coll = fakeExpensesCollection([
      { item: 'swiggy dinner', category: 'Food' },
      { item: 'swiggy lunch', category: 'Food' },
      { item: 'swiggy instamart', category: 'Groceries' },
    ])
    const overrides = {
      find: vi.fn(() => ({ toArray: async () => [{ word: 'instamart', category: 'Groceries' }] })),
    } as unknown as ScopedCollection

    const map = await buildCategoryMap(coll, overrides)
    expect(map.words.swiggy).toBe('Food')
    expect(map.words.instamart).toBe('Groceries')
  })

  it('remembers whole items too, so a payee matches only what was logged under that name', async () => {
    const coll = fakeExpensesCollection([
      { item: 'Swiggy  Instamart', category: 'Groceries' },
      { item: 'swiggy instamart', category: 'Groceries' },
      { item: 'Swiggy', category: 'Food' },
    ])
    const map = await buildCategoryMap(coll)
    expect(map.items).toEqual({ 'swiggy instamart': 'Groceries', swiggy: 'Food' })
    expect(map.words.swiggy).toBe('Groceries')
  })

  it('files an exact item under its latest category, so a correction beats older votes', async () => {
    const coll = fakeExpensesCollection([
      { item: 'Swiggy', category: 'Eating out', timestamp: '2026-10-18T20:00:00+05:30' },
      { item: 'Swiggy', category: 'Groceries', timestamp: '2026-10-01T20:00:00+05:30' },
      { item: 'Swiggy', category: 'Groceries', timestamp: '2026-10-02T20:00:00+05:30' },
      { item: 'Swiggy', category: 'Groceries', timestamp: '2026-10-03T20:00:00+05:30' },
    ])
    expect((await buildCategoryMap(coll)).items.swiggy).toBe('Eating out')
  })

  it('keeps an item named __proto__ as a plain entry', async () => {
    const map = await buildCategoryMap(fakeExpensesCollection([{ item: '__proto__', category: 'Food' }]))
    expect(Object.hasOwn(map.items, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(map.items)).toBe(Object.prototype)
  })

  // Seen in prod: "and"→Groceries, "to"→Metro, "ou"/"ch"/"ap" from half-typed text.
  it('skips filler words and 1-2 letter fragments, from history and overrides alike', async () => {
    const coll = fakeExpensesCollection([{ item: 'bus to office', category: 'Commute' }])
    const overrides = {
      find: vi.fn(() => ({ toArray: async () => [
        { word: 'and', category: 'Groceries', source: 'llm' },
        { word: 'ou', category: 'Outings', source: 'llm' },
      ] })),
    } as unknown as ScopedCollection

    const map = await buildCategoryMap(coll, overrides)
    expect(map.words).toEqual({ bus: 'Commute', office: 'Commute' })
  })

  it('lets an AI guess fill a gap but not beat what the user actually saved; user corrections still win', async () => {
    const coll = fakeExpensesCollection([
      { item: 'coffee', category: 'Eating out' },
      { item: 'chai', category: 'Eating out' },
    ])
    const overrides = {
      find: vi.fn(() => ({ toArray: async () => [
        { word: 'coffee', category: 'Groceries', source: 'llm' },
        { word: 'banana', category: 'Groceries', source: 'llm' },
        { word: 'chai', category: 'Coffee', source: 'user' },
      ] })),
    } as unknown as ScopedCollection

    const map = await buildCategoryMap(coll, overrides)
    expect(map.words.coffee).toBe('Eating out')
    expect(map.words.banana).toBe('Groceries')
    expect(map.words.chai).toBe('Coffee')
  })
})

describe('learnCategoryCorrection', () => {
  function fakeOverrides() {
    return { updateOne: vi.fn(async () => ({})) } as unknown as ScopedCollection & { updateOne: ReturnType<typeof vi.fn> }
  }

  it('saves the user\'s choice as an override when the map would have suggested something else', async () => {
    const overrides = fakeOverrides()
    const map = { words: { apple: 'Groceries' }, updatedAt: '' }

    const learned = await learnCategoryCorrection(map, 'Apple', 'Eating out', overrides)

    expect(learned).toBe(true)
    expect(overrides.updateOne).toHaveBeenCalledWith(
      { word: 'apple' },
      { $set: expect.objectContaining({ word: 'apple', category: 'Eating out', source: 'user' }) },
      { upsert: true },
    )
  })

  it('then wins over the frequency vote that caused the wrong pick', async () => {
    const overrides = fakeOverrides()
    await learnCategoryCorrection({ words: { apple: 'Groceries' }, updatedAt: '' }, 'apple', 'Eating out', overrides)
    const saved = overrides.updateOne.mock.calls.map((c: unknown[]) => (c[1] as { $set: object }).$set)
    const map = await buildCategoryMap(
      fakeExpensesCollection([
        { item: 'apple', category: 'Groceries' },
        { item: 'apple', category: 'Groceries' },
        { item: 'apple', category: 'Eating out' },
      ]),
      { find: vi.fn(() => ({ toArray: async () => saved })) } as unknown as ScopedCollection,
    )
    expect(map.words.apple).toBe('Eating out')
  })

  it('writes nothing when the user kept the suggestion', async () => {
    const overrides = fakeOverrides()
    const learned = await learnCategoryCorrection({ words: { apple: 'Groceries' }, updatedAt: '' }, 'apple', 'Groceries', overrides)
    expect(learned).toBe(false)
    expect(overrides.updateOne).not.toHaveBeenCalled()
  })

  it('writes nothing when the map had no suggestion to correct', async () => {
    const overrides = fakeOverrides()
    const learned = await learnCategoryCorrection({ words: {}, updatedAt: '' }, 'new thing', 'Gifts', overrides)
    expect(learned).toBe(false)
    expect(overrides.updateOne).not.toHaveBeenCalled()
  })
})
