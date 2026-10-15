import { describe, it, expect } from 'vitest'
import type { Row } from '@/lib/models'
import { computeWrapped } from './wrappedAdapter'
import { judgeAll, pickStories, type BudgetLine, type Story, type StoryType } from './wrappedStories'

function e(date: string, amount: number, overrides: Partial<Row> = {}): Row {
  return {
    timestamp: `${date}T12:00:00`,
    date,
    item: `Thing ${date} ${amount}`,
    amount_inr: String(amount),
    category: 'Food',
    notes: '',
    source: 'manual',
    amount: String(amount),
    description: '',
    payment_method: '',
    ...overrides,
  }
}

const days = (from: number, to: number, month = '2026-09') =>
  Array.from({ length: to - from + 1 }, (_, i) => `${month}-${String(from + i).padStart(2, '0')}`)

function deck(rows: Row[], opts: { prev?: Row[]; budgets?: BudgetLine[]; prevBudgets?: BudgetLine[]; month?: string } = {}): Story[] {
  const month = opts.month ?? '2026-09'
  const prev = opts.prev ? computeWrapped(opts.prev, '2026-08') : null
  return pickStories(computeWrapped(rows, month), prev, opts.budgets ?? [], opts.prevBudgets ?? [], 'user_1')
}

type Opts = { prev?: Row[]; budgets?: BudgetLine[] }

/** One rule's verdict, before novelty and the 7-story cut. */
function find<T extends StoryType>(rows: Row[], type: T, opts: Opts = {}) {
  const ctx = {
    cur: computeWrapped(rows, '2026-09'),
    prev: opts.prev ? computeWrapped(opts.prev, '2026-08') : null,
    budgets: opts.budgets ?? [],
  }
  return judgeAll(ctx).find((s) => s.type === type) as { score: number; facts: Extract<Story, { type: T }>['facts'] } | undefined
}

const has = (rows: Row[], type: StoryType, opts: Opts = {}) => find(rows, type, opts) !== undefined

describe('habit stories', () => {
  it('a 3-day streak qualifies, a 2-day one does not', () => {
    expect(find(days(4, 6).map((d) => e(d, 100)), 'streak')?.facts).toMatchObject({ days: 3, startDate: '2026-09-04', endDate: '2026-09-06' })
    expect(has(days(4, 5).map((d) => e(d, 100)), 'streak')).toBe(false)
  })

  it('leaves automated entries out of the streak', () => {
    const rows = [e('2026-09-04', 100), ...days(5, 9).map((d) => e(d, 100, { source: 'recurring' })), e('2026-09-20', 100)]
    expect(has(rows, 'streak')).toBe(false)
  })

  it('a comeback needs 5 quiet days between two logs', () => {
    expect(find([e('2026-09-01', 100), e('2026-09-07', 100)], 'comeback')?.facts).toEqual({
      quietDays: 5,
      startDate: '2026-09-01',
      endDate: '2026-09-07',
    })
    expect(has([e('2026-09-01', 100), e('2026-09-06', 100)], 'comeback')).toBe(false)
  })

  it('night logger reads the logged hour, 10pm to 2am', () => {
    const late = (d: string) => e(d, 100, { timestamp: `${d}T23:15:00` })
    const early = (d: string) => e(d, 100, { timestamp: `${d}T09:00:00` })
    expect(has([...days(1, 2).map(late), ...days(3, 5).map(early)], 'night_logger')).toBe(true) // 2 of 5
    expect(has([late('2026-09-01'), ...days(2, 5).map(early)], 'night_logger')).toBe(false) // 1 of 5
  })

  it('how you log counts scans among self-logged entries', () => {
    const rows = [...days(1, 3).map((d) => e(d, 100, { source: 'scan' })), ...days(4, 7).map((d) => e(d, 100))]
    expect(find(rows, 'how_you_log')?.facts).toEqual({ scans: 3, count: 7 })
  })

  it('showed up is the fallback when no streak says it', () => {
    expect(find([e('2026-09-01', 100), e('2026-09-05', 100)], 'showed_up')?.facts).toEqual({ days: 2, daysInMonth: 30 })
  })
})

describe('money stories', () => {
  it('biggest hit needs 3x the median entry', () => {
    const base = days(1, 4).map((d) => e(d, 100))
    expect(has([...base, e('2026-09-05', 300)], 'biggest_hit')).toBe(true)
    expect(has([...base, e('2026-09-05', 290)], 'biggest_hit')).toBe(false)
  })

  it('heavy week labels real dates, the last bucket ending on the month end', () => {
    const rows = [...days(1, 4).map((d) => e(d, 10)), e('2026-09-25', 900)]
    expect(find(rows, 'heavy_week')?.facts).toMatchObject({ startDate: '2026-09-22', endDate: '2026-09-30', total: 900 })
  })

  it('small stuff needs most entries under a quarter of the mean', () => {
    const rows = [...days(1, 9).map((d) => e(d, 10)), e('2026-09-10', 1000)]
    expect(find(rows, 'small_stuff')?.facts).toEqual({ count: 9, total: 90, of: 10 })
    expect(has(days(1, 10).map((d) => e(d, 100)), 'small_stuff')).toBe(false)
  })

  it('spendiest weekday sends Monday-first totals for the bars', () => {
    // 2026-09-03 is a Thursday; the 7th, 14th, 21st and 28th are Mondays.
    const rows = [e('2026-09-03', 900), ...['07', '14', '21', '28'].map((d) => e(`2026-09-${d}`, 100))]
    const s = find(rows, 'spendiest_weekday')
    expect(s?.facts.day).toBe('Thursday')
    expect(s?.facts.totals).toEqual([400, 0, 0, 900, 0, 0, 0])
  })

  it('sits out a month too thin to have a shape', () => {
    const rows = days(1, 4).map((d, i) => e(d, i === 0 ? 900 : 10))
    expect(has(rows, 'heavy_week')).toBe(false)
    expect(has(rows, 'biggest_hit')).toBe(false)
  })
})

describe('things stories', () => {
  it('your usual folds case and spacing, and needs 4 repeats', () => {
    const chai = ['Chai', 'chai', ' CHAI ', 'Chai'].map((item, i) => e(days(1, 4)[i], 20, { item }))
    expect(find([...chai, e('2026-09-05', 50)], 'your_usual')?.facts).toEqual({ item: 'Chai', count: 4, total: 80 })
    expect(has([...chai.slice(0, 3), e('2026-09-05', 50), e('2026-09-06', 50)], 'your_usual')).toBe(false)
  })
})

describe('envelope stories', () => {
  it('stayed put is what the envelopes held minus what was spent', () => {
    expect(find([e('2026-09-01', 300)], 'stayed_put', { budgets: [{ category: 'Food', amount: 1000 }] })?.facts).toEqual({ left: 700, assigned: 1000 })
  })

  it('a burst envelope is the one furthest past 120% of its budget', () => {
    const rows = [e('2026-09-01', 130), e('2026-09-02', 500, { category: 'Travel' })]
    const budgets = [
      { category: 'Food', amount: 100 },
      { category: 'Travel', amount: 400 },
    ]
    expect(find(rows, 'burst_envelope', { budgets })?.facts).toEqual({ category: 'Food', spent: 130, budget: 100 })
    expect(has(rows, 'burst_envelope', { budgets: [{ category: 'Food', amount: 110 }] })).toBe(false)
  })
})

describe('vs last month', () => {
  const prev = [e('2026-08-01', 1000)]

  it('up or down needs a 10% move', () => {
    expect(find([e('2026-09-01', 1100)], 'up_or_down', { prev })?.facts).toEqual({ previousMonth: '2026-08', previousTotal: 1000, total: 1100 })
    expect(has([e('2026-09-01', 1090)], 'up_or_down', { prev })).toBe(false)
    expect(has([e('2026-09-01', 1500)], 'up_or_down')).toBe(false)
  })

  it('new category is spend in a category last month never had', () => {
    const rows = [e('2026-09-01', 800), e('2026-09-02', 200, { category: 'Pets' })]
    expect(find(rows, 'new_category', { prev })?.facts).toEqual({ category: 'Pets', total: 200 })
  })

  it('category mover needs a 50% move that matters to the month', () => {
    expect(find([e('2026-09-01', 1600)], 'category_mover', { prev })?.facts).toEqual({ category: 'Food', previous: 1000, current: 1600 })
    expect(has([e('2026-09-01', 1400)], 'category_mover', { prev })).toBe(false)
  })

  it('habit change spots a longer streak', () => {
    const rows = days(1, 6).map((d) => e(d, 100))
    expect(find(rows, 'habit_change', { prev: days(1, 2, '2026-08').map((d) => e(d, 100)) })?.facts).toEqual({ metric: 'streak', from: 2, to: 6 })
  })
})

describe('pickStories', () => {
  // A busy month where nearly every rule qualifies.
  const busy = [
    ...days(1, 20).map((d) => e(d, 20, { item: 'Chai', timestamp: `${d}T23:00:00`, source: 'scan' })),
    e('2026-09-05', 5000, { category: 'Rent' }),
    e('2026-09-26', 300, { category: 'Travel' }),
  ]
  const busyOpts = { prev: [e('2026-08-01', 900)], budgets: [{ category: 'Food', amount: 100 }] }

  it('runs at most 7 stories, at most 2 per group, in group order', () => {
    const stories = deck(busy, busyOpts)
    expect(stories.length).toBe(7)
    const groups = stories.map((s) => s.group)
    for (const g of new Set(groups)) expect(groups.filter((x) => x === g).length).toBeLessThanOrEqual(2)
    const order = ['habit', 'money', 'things', 'envelopes', 'vs_last']
    expect(groups.map((g) => order.indexOf(g))).toEqual([...groups.map((g) => order.indexOf(g))].sort((a, b) => a - b))
  })

  it('is deterministic, variants included', () => {
    expect(deck(busy, busyOpts)).toEqual(deck(busy, busyOpts))
  })

  it('a thin month shows only what qualifies', () => {
    expect(deck([e('2026-09-01', 100), e('2026-09-05', 100)]).map((s) => s.type)).toEqual(['showed_up'])
  })

  it('an empty month has no stories, not even "down from last month"', () => {
    expect(deck([], { prev: [e('2026-08-01', 1000)] })).toEqual([])
  })

  it('does not run "showed up" beside a streak that already says it', () => {
    const everyDay = days(1, 30).map((d) => e(d, 100))
    const types = deck(everyDay).map((s) => s.type)
    expect(types).toContain('streak')
    expect(types).not.toContain('showed_up')
  })

  it('scores down a story last month ran', () => {
    const month = days(1, 14).map((d) => e(d, 100))
    const fresh = deck(month).find((s) => s.type === 'streak')!.score
    const repeat = deck(month, { prev: days(1, 14, '2026-08').map((d) => e(d, 100)) }).find((s) => s.type === 'streak')!.score
    expect(repeat).toBeLessThan(fresh)
  })
})
