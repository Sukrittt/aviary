import { getCollection } from '@/lib/http'
import { EXPENSE_HEADERS, toRow } from '@/lib/models'
import type { Auth } from '@/lib/access'
import { cachedRead } from '@/lib/cache'
import { computeCarry } from '@/lib/budgetCarry'
import { computeWrapped, type WrappedData } from '@/src/services/wrappedAdapter'
import { pickStories, type BudgetLine, type Story } from '@/src/services/wrappedStories'
import { CREDIT_CARD_CATEGORY, INCOME_CATEGORY } from '@/src/lib/envelope'

/** Minimum logged expenses in a month before its Wrapped edition unlocks. */
export const WRAPPED_MIN_TRANSACTIONS = 10

/** The one edition currently available: the previous completed calendar month, IST. 'YYYY-MM'. */
export function currentEdition(today: string): string {
  const [y, m] = today.split('-').map(Number)
  const prevMonth = m === 1 ? 12 : m - 1
  const prevYear = m === 1 ? y - 1 : y
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`
}

/** Inclusive 'YYYY-MM-DD' start/end for a 'YYYY-MM' month. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const start = `${month}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${month}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/** Transaction count + availability for a month's edition, without computing the full recap. */
export async function editionStatus(
  auth: Auth,
  month: string,
): Promise<{ month: string; transactionCount: number; available: boolean; minTransactions: number }> {
  const { start, end } = monthRange(month)
  const coll = await getCollection('expenses', auth)
  const docs = await coll.find({ date: { $gte: start, $lte: end } }).toArray()
  const rows = docs.map((d) => toRow(EXPENSE_HEADERS, d))
  const transactionCount = rows.filter((r) => Number(r.amount_inr) > 0 && r.category !== CREDIT_CARD_CATEGORY && r.category !== INCOME_CATEGORY).length
  return {
    month,
    transactionCount,
    available: transactionCount >= WRAPPED_MIN_TRANSACTIONS,
    minTransactions: WRAPPED_MIN_TRANSACTIONS,
  }
}

/**
 * The month's computed recap, cached per user-month. Shared by `/api/wrapped`
 * and the judgement route so a judgement request costs no extra Mongo read
 * once the recap is warm.
 */
export function readRecap(auth: Auth, month: string): Promise<WrappedData> {
  const { start, end } = monthRange(month)
  return cachedRead(
    'wrapped',
    auth.spaceId,
    async () => {
      const coll = await getCollection('expenses', auth)
      const docs = await coll.find({ date: { $gte: start, $lte: end } }).toArray()
      return computeWrapped(docs.map((d) => toRow(EXPENSE_HEADERS, d)), month)
    },
    // v2: recaps carry `facts`; one cached before that would crash the story picker.
    `v2:${month}`,
  )
}

/** What `/api/wrapped` sends: the recap minus its internal facts, plus the deck and last month's summary. */
export type WrappedResponse = Omit<WrappedData, 'facts'> & {
  stories: Story[]
  previous: {
    month: string
    totalSpent: number
    daysLogged: number
    longestStreak: number
    topCategories: { category: string; total: number }[]
  } | null
}

/**
 * The recap plus its story deck. Budgets are read fresh rather than cached with
 * the recap, so editing an envelope shows up without busting every month's recap.
 */
export async function readWrapped(auth: Auth, month: string): Promise<WrappedResponse> {
  // currentEdition answers "the month before this date", which is exactly last month.
  const prevMonth = currentEdition(`${month}-01`)
  const budgetColl = await getCollection('budgets', auth)
  const [recap, prevRecap, budgetDocs, carry, prevCarry] = await Promise.all([
    readRecap(auth, month),
    readRecap(auth, prevMonth),
    budgetColl.find({ month: { $in: [month, prevMonth] } }).toArray(),
    computeCarry(auth, month),
    computeCarry(auth, prevMonth),
  ])
  // What each envelope held that month: its assignment plus what rolled in.
  const rolledIn = (m: string, category: string) => (m === month ? carry : prevCarry).rolled_over[category] ?? 0
  const linesFor = (m: string): BudgetLine[] =>
    budgetDocs
      // The credit card and income rows aren't envelopes.
      .filter((b) => b.month === m && b.category !== CREDIT_CARD_CATEGORY && b.category !== INCOME_CATEGORY)
      .map((b) => ({ category: String(b.category), amount: (Number(b.assigned) || 0) + rolledIn(m, String(b.category)) }))
      .filter((b) => b.amount > 0)

  const prev = prevRecap.totalTransactions > 0 ? prevRecap : null
  const { facts: _facts, ...rest } = recap
  return {
    ...rest,
    stories: pickStories(recap, prev, linesFor(month), linesFor(prevMonth), auth.userId),
    previous: prev && {
      month: prev.month,
      totalSpent: prev.totalSpent,
      daysLogged: prev.facts.selfLogged.days,
      longestStreak: prev.facts.selfLogged.streak?.days ?? 0,
      topCategories: prev.topCategories.map((c) => ({ category: c.category, total: c.total })),
    },
  }
}
