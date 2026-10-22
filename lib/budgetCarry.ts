import type { ClientSession } from 'mongodb'
import type { Auth } from '@/lib/access'
import { getCollection } from '@/lib/http'
import type { ScopedCollection } from '@/lib/scoped'
import { computeEnvelopeState, shiftMonthKey, type Carry } from '@/src/lib/envelope'
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
 * What every month from ROLLOVER_START up to (not including) `month` left
 * behind: each envelope's ending available, and the ending Ready to assign.
 * Each month's ending state is that month's computeEnvelopeState fed the
 * month before's carry, so the math is the clients' math exactly. Negative
 * values carry too (an overspent envelope, an over-assigned month).
 *
 * Computed from full history on every read, never stored, so a late edit to an
 * earlier month (an expense logged on the 3rd, dated the 30th) just works.
 * ponytail: O(months × rows) per read; materialise per-month summaries if it
 * ever measurably hurts.
 */
export function carryFrom(budgets: BudgetRow[], expenses: ExpenseRow[], categories: CategoryRow[], month: string): Carry {
  let carry: Carry = { ready_to_assign: 0, rolled_over: {} }
  for (let m = ROLLOVER_START; m < month; m = shiftMonthKey(m, 1)) {
    const state = computeEnvelopeState(budgets, expenses, m, categories, [], undefined, carry)
    const rolled_over: Record<string, number> = {}
    for (const e of state.envelopes) {
      const left = round2(e.available)
      if (left !== 0) rolled_over[e.category] = left
    }
    carry = { ready_to_assign: state.readyToAssign, rolled_over }
  }
  return carry
}

/** carryFrom over the space's own rows. Amounts are encrypted fields, so this
 * sums in app code after decrypt rather than in an aggregation pipeline. */
export async function computeCarry(auth: Auth, month: string): Promise<Carry & { month: string }> {
  if (month <= ROLLOVER_START) return { month, ready_to_assign: 0, rolled_over: {} }
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
    rolled_over: '0',
    extra: String(d.extra ?? 0),
    version: 0,
  }))
  const expenses = expenseDocs.map((d): ExpenseRow => ({
    timestamp: '', date: String(d.date ?? ''), item: '', amount_inr: String(d.amount_inr ?? d.amount ?? 0),
    category: String(d.category ?? ''), notes: '', source: '', amount: '', description: '', payment_method: '',
  }))
  const categories = categoryDocs.map((d): CategoryRow => ({ name: String(d.name ?? ''), group: '' })).filter((c) => c.name)
  return { month, ...carryFrom(budgets, expenses, categories, month) }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
