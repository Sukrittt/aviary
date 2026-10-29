import { describe, it, expect, vi, beforeEach } from 'vitest'

const runJev = vi.fn()
vi.mock('./jev', () => ({ runJev: (...args: unknown[]) => runJev(...(args as [])) }))
const stored = { find: vi.fn(), bulkWrite: vi.fn() }
vi.mock('@/lib/http', () => ({ getCollection: async () => stored }))

const { projectionFacts, tagOneOffs, tagKey } = await import('./projection')
const caller = { userId: 'user_1', feature: 'chat' as const }
const auth = { spaceId: 'space_1' } as Parameters<typeof tagOneOffs>[0]

const base = {
  spendingOnly: 40000,
  newItems: [
    { date: '2026-10-21', item: 'Football Boots', amount: 6000, category: 'Shopping' },
    { date: '2026-10-28', item: 'Toiletries', amount: 800, category: 'Household' },
    { date: '2026-10-02', item: 'Lunch with papa', amount: 420, category: 'Eating Out' },
    { date: '2026-10-04', item: 'lunch with Papa', amount: 180, category: 'Eating Out' },
  ],
  missingRegulars: [{ category: 'Electricity', usual: 460 }],
}
const tags = (entries: [string, number][]) => new Map(entries.map(([item, p]) => [tagKey('space_1', item), p]))

beforeEach(() => {
  vi.clearAllMocks()
  stored.find.mockReturnValue({ toArray: async () => [] })
  stored.bulkWrite.mockResolvedValue({})
})

describe('projectionFacts', () => {
  it('works out the regular month: spending only, minus one-offs, plus regulars not paid yet', () => {
    const text = projectionFacts(base, tags([['Football Boots', 0.92], ['Toiletries', 0.2], ['Lunch with papa', 0.8]]), 'space_1')
    // 40000 - (6000 + 420 + 180) + 460. Item names match however they are cased.
    expect(text).toContain('PROJECTED REGULAR MONTH: 33860 (spending only 40000, minus one-offs 6600, plus regular costs not paid yet this month 460)')
    expect(text).toContain('2026-10-21|Football Boots|6000|Shopping')
    expect(text).toContain('2026-10-04|lunch with Papa|180|Eating Out')
    expect(text).not.toContain('Toiletries')
    expect(text).toContain('Electricity|460')
  })

  it('keeps items Jev is unsure about, or has not tagged', () => {
    expect(projectionFacts(base, tags([['Football Boots', 0.65]]), 'space_1')).toContain('minus one-offs 0,')
  })
})

describe('tagOneOffs', () => {
  it('asks Jev only about names with no stored tag, once per name, and stores the answers', async () => {
    runJev.mockResolvedValue({ i0: { type: 'boolean', probability: 0.1 }, i1: { type: 'boolean', probability: 0.85 } })
    const out = await tagOneOffs(auth, base.newItems, caller, tags([['Football Boots', 0.92]]))
    expect(Object.keys(runJev.mock.calls[0][1])).toEqual(['i0', 'i1'])
    expect(runJev.mock.calls[0][0]).toEqual({ item_0: 'Toiletries (800, category Household)', item_1: 'Lunch with papa (420, category Eating Out)' })
    expect(out.get(tagKey('space_1', 'LUNCH WITH PAPA'))).toBe(0.85)
    expect(out.get(tagKey('space_1', 'Football Boots'))).toBe(0.92)
    expect(stored.bulkWrite.mock.calls[0][0]).toHaveLength(2)
  })

  it('skips Jev when every name is tagged', async () => {
    await tagOneOffs(auth, base.newItems.slice(0, 1), caller, tags([['Football Boots', 0.92]]))
    expect(runJev).not.toHaveBeenCalled()
  })

  it('reads the stored tags itself when none are passed', async () => {
    stored.find.mockReturnValue({ toArray: async () => [{ _id: tagKey('space_1', 'Football Boots'), p: 0.9 }] })
    await tagOneOffs(auth, base.newItems.slice(0, 1), caller)
    expect(runJev).not.toHaveBeenCalled()
  })

  it('returns what it had when Jev fails', async () => {
    runJev.mockRejectedValue(new Error('timeout'))
    const out = await tagOneOffs(auth, base.newItems, caller, tags([['Football Boots', 0.92]]))
    expect(out.size).toBe(1)
    expect(stored.bulkWrite).not.toHaveBeenCalled()
  })
})
