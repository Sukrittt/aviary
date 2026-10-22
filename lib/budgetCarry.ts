import type { ClientSession } from 'mongodb'
import type { Auth } from '@/lib/access'
import { getCollection } from '@/lib/http'
import type { ScopedCollection } from '@/lib/scoped'
import { computeEnvelopeState, INCOME_CATEGORY, shiftMonthKey, type Carry } from '@/src/lib/envelope'
import type { BudgetRow, CategoryRow, ExpenseRow } from '@/src/types'

/** The first month whose leftovers carry: October 2026 rolls into November.
 * Earlier months contribute nothing, so nobody's history gets rewritten. */
export const ROLLOVER_START = '2026-10'

/** Never carries a balance forward — see carriedAssigned() below. */
const CC_CATEGORY = '__credit_card__'

/** The most recent prior month's assigned amount for a category, or 0 if
 * there isn't one — mirrors the client's carry-forward convention (Mobile's
 * src/lib/envelope.ts::carriedAssigned / Web's src/services/budgetLoader.ts).
 * The credit-card envelope never carries: it's money set aside for *last*
 * month's card spending, not a recurring target. */
export async function carriedAssigned(
  budgetColl: ScopedCollection,
  category: string,
  month: string,
  session: ClientSession,
): Promise<number> {
  if (category === CC_CATEGORY) return 0
  const rows = await budgetColl.find({ category }, { session }).toArray()
  const prior = rows
    .filter((r) => typeof r.month === 'string' && r.month < month)
    .sort((a, b) => (b.month as string).localeCompare(a.month as string))[0]
  return prior ? Number(prior.assigned) || 0 : 0
}

/**
 * What every month from the space's rollover start up to (not including)
 * `month` left behind: each envelope's ending available, and the ending Ready
 * to assign. Each month's ending state is that month's computeEnvelopeState
 * fed the month before's carry, so the math is the clients' math exactly.
 * Negative values carry too (an overspent envelope, an over-assigned month).
 *
 * A row's `rolled_over` is a one-month adjustment to that month's carry, moved
 * out of (or into) Ready to assign: Move money writes it when it moves carried
 * money, so the recurring `assigned` target stays put. `month`'s own
 * adjustments are in the result, since that's what its screen shows.
 *
 * A month's envelopes are the categories listed now, minus any whose `since`
 * (set when a deleted name is re-created) is later. Anything else that month
 * is gone: its leftover moves to Ready to assign as the month starts, and its
 * spending comes out of Ready to assign, so deleting a category can't erase
 * what it spent and a re-created one doesn't replay its old target.
 *
 * Computed from full history on every read, never stored, so a late edit to an
 * earlier month (an expense logged on the 3rd, dated the 30th) just works.
 * ponytail: O(months × rows) per read; materialise per-month summaries if it
 * ever measurably hurts.
 */
export function carryFrom(budgets: BudgetRow[], expenses: ExpenseRow[], categories: (CategoryRow & { since?: string })[], month: string): Carry {
  const liveIn = (m: string) => categories.filter((c) => !c.since || c.since <= m)

  let carry: Carry = { ready_to_assign: 0, rolled_over: {} }
  for (let m = rolloverStart(budgets); m < month; m = shiftMonthKey(m, 1)) {
    const live = liveIn(m)
    const state = computeEnvelopeState(budgets, expenses, m, live, [], undefined, settle(withAdjustments(carry, budgets, m), live))
    const rolled_over: Record<string, number> = {}
    for (const e of state.envelopes) {
      const left = round2(e.available)
      if (left !== 0) rolled_over[e.category] = left
    }
    carry = { ready_to_assign: state.readyToAssign, rolled_over }
  }
  return settle(withAdjustments(carry, budgets, month), liveIn(month))
}

/** `carry` with every envelope that isn't in `live` folded into Ready to assign. */
function settle(carry: Carry, live: CategoryRow[]): Carry {
  const names = new Set(live.map((c) => c.name))
  const out: Carry = { ready_to_assign: carry.ready_to_assign, rolled_over: {} }
  for (const [category, left] of Object.entries(carry.rolled_over)) {
    if (names.has(category) || category === CC_CATEGORY) out.rolled_over[category] = left
    else out.ready_to_assign = round2(out.ready_to_assign + left)
  }
  return out
}

/** The space's first month with an envelope assigned, or ROLLOVER_START if
 * that's later. Income and card rows don't count: importing an old statement
 * can create those for months nobody budgeted. */
function rolloverStart(budgets: BudgetRow[]): string {
  let first = ''
  for (const b of budgets) {
    if (b.category === INCOME_CATEGORY || b.category === CC_CATEGORY) continue
    if (!first || b.month < first) first = b.month
  }
  if (!first) return '9999-12' // no envelope yet: nothing carries
  return first > ROLLOVER_START ? first : ROLLOVER_START
}

/** `carry` plus month `m`'s rolled_over adjustments, balanced out of Ready to assign. */
function withAdjustments(carry: Carry, budgets: BudgetRow[], m: string): Carry {
  const out: Carry = { ready_to_assign: carry.ready_to_assign, rolled_over: { ...carry.rolled_over } }
  if (m < ROLLOVER_START) return out
  for (const b of budgets) {
    const adjust = b.month === m && b.category !== INCOME_CATEGORY ? Number(b.rolled_over) || 0 : 0
    if (!adjust) continue
    const next = round2((out.rolled_over[b.category] ?? 0) + adjust)
    if (next) out.rolled_over[b.category] = next
    else delete out.rolled_over[b.category]
    out.ready_to_assign = round2(out.ready_to_assign - adjust)
  }
  return out
}

/** carryFrom over the space's own rows. Amounts are encrypted fields, so this
 * sums in app code after decrypt rather than in an aggregation pipeline. */
export async function computeCarry(auth: Auth, month: string): Promise<Carry & { month: string }> {
  if (month < ROLLOVER_START) return { month, ready_to_assign: 0, rolled_over: {} }
  const [budgetsColl, expensesColl, categoriesColl] = await Promise.all([
    getCollection('budgets', auth),
    getCollection('expenses', auth),
    getCollection('categories', auth),
  ])
  const [budgetDocs, expenseDocs, categoryDocs] = await Promise.all([
    budgetsColl.find({}).toArray(),
    // Indexed by { user_id: 1, date: -1 }. Only months the carry reads.
    expensesColl.find({ date: { $gte: `${ROLLOVER_START}-01`, $lt: `${month}-01` } }).toArray(),
    categoriesColl.find({}).toArray(),
  ])
  const budgets = budgetDocs.map((d): BudgetRow => ({
    month: String(d.month ?? ''),
    category: String(d.category ?? ''),
    assigned: String(d.assigned ?? 0),
    rolled_over: String(d.rolled_over ?? 0),
    extra: String(d.extra ?? 0),
    version: 0,
  }))
  const expenses = expenseDocs.map((d): ExpenseRow => ({
    timestamp: '', date: String(d.date ?? ''), item: '', amount_inr: String(d.amount_inr ?? d.amount ?? 0),
    category: String(d.category ?? ''), notes: '', source: '', amount: '', description: '', payment_method: '',
  }))
  const categories = categoryDocs
    .map((d) => ({ name: String(d.name ?? ''), group: '', ...(typeof d.since === 'string' ? { since: d.since } : {}) }))
    .filter((c) => c.name)
  return { month, ...carryFrom(budgets, expenses, categories, month) }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
