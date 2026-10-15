import type { WrappedData } from './wrappedAdapter'

/**
 * Picks the month's Wrapped deck: every story type has an eligibility rule (so a
 * line only shows when the data backs it) and a 0..1 score for how unusual it is
 * this month. The top few make the deck, so it changes month to month with what
 * actually happened. Clients own the words and visuals; this only decides which
 * stories run and in what order. Spec: aviary-mobile
 * docs/superpowers/specs/2026-10-16-wrapped-story-engine-design.md
 */

export const STORY_GROUPS = ['habit', 'money', 'things', 'envelopes', 'vs_last'] as const
export type StoryGroup = (typeof STORY_GROUPS)[number]

type Span = { days: number; startDate: string; endDate: string }

export interface StoryFacts {
  showed_up: { days: number; daysInMonth: number }
  streak: Span
  comeback: { quietDays: number; startDate: string; endDate: string }
  night_logger: { lateCount: number; count: number }
  how_you_log: { scans: number; count: number }
  biggest_hit: { item: string; amount: number; category: string; date: string; timesMedian: number }
  small_stuff: { count: number; total: number; of: number }
  spendiest_weekday: { day: string; total: number; count: number; totals: number[] }
  heavy_week: { startDate: string; endDate: string; total: number; share: number }
  weekend_split: { heavier: 'weekend' | 'weekday'; ratio: number }
  your_usual: { item: string; count: number; total: number }
  top_category: { category: string; total: number; pct: number; runnersUp: { category: string; total: number }[] }
  where_it_went: { categories: { category: string; total: number; pct: number }[] }
  stayed_put: { left: number; assigned: number }
  burst_envelope: { category: string; spent: number; budget: number }
  up_or_down: { previousMonth: string; previousTotal: number; total: number }
  category_mover: { category: string; previous: number; current: number }
  new_category: { category: string; total: number }
  habit_change: { metric: 'streak' | 'days'; from: number; to: number }
}
export type StoryType = keyof StoryFacts

export type Story = {
  [T in StoryType]: { type: T; group: StoryGroup; score: number; variant: number; facts: StoryFacts[T] }
}[StoryType]

/** Envelope budget for one category: assigned plus rolled over. */
export interface BudgetLine {
  category: string
  amount: number
}

export interface Ctx {
  cur: WrappedData
  prev: WrappedData | null
  budgets: BudgetLine[]
}

type Rule<T extends StoryType> = {
  type: T
  group: StoryGroup
  judge: (ctx: Ctx) => { score: number; facts: StoryFacts[T] } | null
}

const MAX_STORIES = 7
const MAX_PER_GROUP = 2
/** A story last month's deck ran keeps this share of its score, so decks rarely repeat back to back. */
const NOVELTY_FACTOR = 0.6
/** Below this, one entry makes every share 100% ("Thursday was your spendiest day"), so money and things stories sit out. */
const MIN_ENTRIES_FOR_SHAPE = 5

/** Eligible at `threshold` (0.3), full marks at `strong` (1). */
function scale(value: number, threshold: number, strong: number): number {
  return Math.min(1, Math.max(0.3, 0.3 + (0.7 * (value - threshold)) / (strong - threshold)))
}

const rules: { [T in StoryType]: Rule<T> }[StoryType][] = [
  {
    type: 'showed_up',
    group: 'habit',
    judge: ({ cur }) => {
      const { days, streak } = cur.facts.selfLogged
      // One streak that is most of the logging says this already ("31-day streak" beside "31 of 31 days").
      if (days === 0 || (streak && streak.days >= 3 && streak.days >= 0.8 * days)) return null
      const share = days / cur.facts.daysInMonth
      // Otherwise always eligible as a fallback, but only competitive once most of the month is logged.
      return { score: share >= 0.6 ? scale(share, 0.6, 1) : 0.1 + share * 0.3, facts: { days, daysInMonth: cur.facts.daysInMonth } }
    },
  },
  {
    type: 'streak',
    group: 'habit',
    judge: ({ cur }) => {
      const s = cur.facts.selfLogged.streak
      return s && s.days >= 3 ? { score: scale(s.days, 3, 14), facts: s } : null
    },
  },
  {
    type: 'comeback',
    group: 'habit',
    judge: ({ cur }) => {
      const g = cur.facts.selfLogged.gap
      const quietDays = g ? g.days - 1 : 0
      return g && quietDays >= 5 ? { score: scale(quietDays, 5, 15), facts: { quietDays, startDate: g.startDate, endDate: g.endDate } } : null
    },
  },
  {
    type: 'night_logger',
    group: 'habit',
    judge: ({ cur }) => {
      const { count, lateCount } = cur.facts.selfLogged
      const share = count > 0 ? lateCount / count : 0
      return count >= 5 && share >= 0.4 ? { score: scale(share, 0.4, 0.8), facts: { lateCount, count } } : null
    },
  },
  {
    type: 'how_you_log',
    group: 'habit',
    judge: ({ cur }) => {
      const { count, scanCount } = cur.facts.selfLogged
      const share = count > 0 ? scanCount / count : 0
      return count >= 5 && share >= 0.3 ? { score: scale(share, 0.3, 0.8), facts: { scans: scanCount, count } } : null
    },
  },
  {
    type: 'biggest_hit',
    group: 'money',
    judge: ({ cur }) => {
      const p = cur.biggestPurchase
      const median = cur.facts.medianAmount
      if (!p || cur.totalTransactions < 3 || median <= 0) return null
      const timesMedian = p.amountInr / median
      return timesMedian >= 3
        ? { score: scale(timesMedian, 3, 12), facts: { item: p.item, amount: p.amountInr, category: p.category, date: p.date, timesMedian } }
        : null
    },
  },
  {
    type: 'small_stuff',
    group: 'money',
    judge: ({ cur }) => {
      const { count, total } = cur.facts.small
      const share = cur.totalTransactions > 0 ? count / cur.totalTransactions : 0
      return cur.totalTransactions >= 10 && share >= 0.6
        ? { score: scale(share, 0.6, 0.9), facts: { count, total, of: cur.totalTransactions } }
        : null
    },
  },
  {
    type: 'spendiest_weekday',
    group: 'money',
    judge: ({ cur }) => {
      const w = cur.topWeekday
      const totals = cur.facts.weekdayTotals
      const mean = totals.reduce((s, t) => s + t, 0) / 7
      if (!w || mean <= 0) return null
      const ratio = w.total / mean
      return ratio >= 1.5 ? { score: scale(ratio, 1.5, 4), facts: { day: w.day, total: w.total, count: w.count, totals } } : null
    },
  },
  {
    type: 'heavy_week',
    group: 'money',
    judge: ({ cur }) => {
      if (cur.totalSpent <= 0 || cur.weeklyTotals.length === 0) return null
      const i = cur.weeklyTotals.reduce((best, w, j, all) => (w.total > all[best].total ? j : best), 0)
      const total = cur.weeklyTotals[i].total
      const share = total / cur.totalSpent
      const day = (n: number) => `${cur.month}-${String(n).padStart(2, '0')}`
      const last = i === cur.weeklyTotals.length - 1 ? cur.facts.daysInMonth : i * 7 + 7
      return share >= 0.4
        ? { score: scale(share, 0.4, 0.8), facts: { startDate: day(i * 7 + 1), endDate: day(last), total, share } }
        : null
    },
  },
  {
    type: 'weekend_split',
    group: 'money',
    judge: ({ cur }) => {
      const { weekend, weekday } = cur.facts.perDay
      if (weekend <= 0 || weekday <= 0) return null
      const heavier = weekend >= weekday ? 'weekend' : 'weekday'
      const ratio = Math.max(weekend, weekday) / Math.min(weekend, weekday)
      return ratio >= 1.5 ? { score: scale(ratio, 1.5, 4), facts: { heavier, ratio } } : null
    },
  },
  {
    type: 'your_usual',
    group: 'things',
    judge: ({ cur }) => {
      const t = cur.facts.topItem
      return t && t.count >= 4 ? { score: scale(t.count, 4, 15), facts: t } : null
    },
  },
  {
    type: 'top_category',
    group: 'things',
    judge: ({ cur }) => {
      const [top, ...rest] = cur.topCategories
      return top && rest.length > 0 && top.pct >= 35
        ? {
            score: scale(top.pct, 35, 85),
            facts: { ...top, runnersUp: rest.slice(0, 2).map((c) => ({ category: c.category, total: c.total })) },
          }
        : null
    },
  },
  {
    type: 'where_it_went',
    group: 'things',
    judge: ({ cur }) => {
      const n = Object.keys(cur.facts.categoryTotals).length
      // A staple rather than a surprise, so it never outranks a real standout.
      return n >= 3 ? { score: Math.min(0.5, scale(n, 3, 8)), facts: { categories: cur.topCategories } } : null
    },
  },
  {
    type: 'stayed_put',
    group: 'envelopes',
    judge: ({ cur, budgets }) => {
      const assigned = budgets.reduce((s, b) => s + b.amount, 0)
      const left = assigned - cur.totalSpent
      return assigned > 0 && left / assigned >= 0.05 ? { score: scale(left / assigned, 0.05, 0.5), facts: { left, assigned } } : null
    },
  },
  {
    type: 'burst_envelope',
    group: 'envelopes',
    judge: ({ cur, budgets }) => {
      let worst: StoryFacts['burst_envelope'] | null = null
      for (const b of budgets) {
        const spent = cur.facts.categoryTotals[b.category] ?? 0
        if (b.amount > 0 && spent / b.amount >= 1.2 && (!worst || spent / b.amount > worst.spent / worst.budget)) {
          worst = { category: b.category, spent, budget: b.amount }
        }
      }
      return worst ? { score: scale(worst.spent / worst.budget, 1.2, 2.5), facts: worst } : null
    },
  },
  {
    type: 'up_or_down',
    group: 'vs_last',
    judge: ({ cur, prev }) => {
      if (!prev || prev.totalSpent <= 0) return null
      const change = Math.abs(cur.totalSpent - prev.totalSpent) / prev.totalSpent
      return change >= 0.1
        ? { score: scale(change, 0.1, 0.6), facts: { previousMonth: prev.month, previousTotal: prev.totalSpent, total: cur.totalSpent } }
        : null
    },
  },
  {
    type: 'category_mover',
    group: 'vs_last',
    judge: ({ cur, prev }) => {
      if (!prev) return null
      let best: StoryFacts['category_mover'] | null = null
      for (const [category, current] of Object.entries(cur.facts.categoryTotals)) {
        const previous = prev.facts.categoryTotals[category] ?? 0
        const delta = Math.abs(current - previous)
        // Both months had it (new ones are `new_category`), it moved by half, and the move matters to the month.
        if (previous > 0 && delta / previous >= 0.5 && delta >= 0.1 * cur.totalSpent && (!best || delta > Math.abs(best.current - best.previous))) {
          best = { category, previous, current }
        }
      }
      return best ? { score: scale(Math.abs(best.current - best.previous) / best.previous, 0.5, 3), facts: best } : null
    },
  },
  {
    type: 'new_category',
    group: 'vs_last',
    judge: ({ cur, prev }) => {
      if (!prev || prev.totalTransactions === 0 || cur.totalSpent <= 0) return null
      const fresh = Object.entries(cur.facts.categoryTotals)
        .filter(([c]) => !(c in prev.facts.categoryTotals))
        .sort((a, b) => b[1] - a[1])[0]
      if (!fresh) return null
      const share = fresh[1] / cur.totalSpent
      return share >= 0.05 ? { score: scale(share, 0.05, 0.3), facts: { category: fresh[0], total: fresh[1] } } : null
    },
  },
  {
    type: 'habit_change',
    group: 'vs_last',
    judge: ({ cur, prev }) => {
      if (!prev) return null
      const streakNow = cur.facts.selfLogged.streak?.days ?? 0
      const streakThen = prev.facts.selfLogged.streak?.days ?? 0
      if (streakNow - streakThen >= 2) {
        return { score: scale(streakNow - streakThen, 2, 10), facts: { metric: 'streak', from: streakThen, to: streakNow } }
      }
      const daysNow = cur.facts.selfLogged.days
      const daysThen = prev.facts.selfLogged.days
      return daysNow - daysThen >= 3 ? { score: scale(daysNow - daysThen, 3, 15), facts: { metric: 'days', from: daysThen, to: daysNow } } : null
    },
  },
]

/** FNV-1a. Stable across runtimes so web and mobile pick the same copy line. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

type Judged = { type: StoryType; group: StoryGroup; score: number; facts: unknown }

/** Every eligible story with its raw score, before novelty and the cut. Exported for tests. */
export function judgeAll(ctx: Ctx): Judged[] {
  const out: Judged[] = []
  if (ctx.cur.totalTransactions === 0) return out
  for (const rule of rules) {
    if ((rule.group === 'money' || rule.group === 'things') && ctx.cur.totalTransactions < MIN_ENTRIES_FOR_SHAPE) continue
    const r = (rule.judge as (c: Ctx) => { score: number; facts: unknown } | null)(ctx)
    if (r) out.push({ type: rule.type, group: rule.group, ...r })
  }
  return out
}

function select(judged: Judged[]): Judged[] {
  const perGroup = new Map<StoryGroup, number>()
  const chosen: Judged[] = []
  for (const s of [...judged].sort((a, b) => b.score - a.score)) {
    if (chosen.length === MAX_STORIES) break
    const n = perGroup.get(s.group) ?? 0
    if (n >= MAX_PER_GROUP) continue
    perGroup.set(s.group, n + 1)
    chosen.push(s)
  }
  // Running order: habit, money, things, envelopes, vs last month. Higher score first within a group.
  return chosen.sort((a, b) => STORY_GROUPS.indexOf(a.group) - STORY_GROUPS.indexOf(b.group) || b.score - a.score)
}

/**
 * The month's deck. `prev` is last month's recap (null when there's none), `seed`
 * keeps copy variants stable per user. Deterministic: same inputs, same deck.
 *
 * ponytail: last month's deck is re-picked without its own previous month, so a
 * vs-last-month story it ran isn't seen by the novelty step. Exact would mean
 * recursing a month further back for every request.
 */
export function pickStories(cur: WrappedData, prev: WrappedData | null, budgets: BudgetLine[], prevBudgets: BudgetLine[], seed: string): Story[] {
  const lastDeck = prev ? new Set(select(judgeAll({ cur: prev, prev: null, budgets: prevBudgets })).map((s) => s.type)) : new Set()
  const judged = judgeAll({ cur, prev, budgets }).map((s) => (lastDeck.has(s.type) ? { ...s, score: s.score * NOVELTY_FACTOR } : s))
  return select(judged).map((s) => ({ ...s, score: Math.round(s.score * 100) / 100, variant: hash(`${seed}:${cur.month}:${s.type}`) }) as Story)
}
