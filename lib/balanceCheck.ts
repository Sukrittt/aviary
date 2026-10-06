import type { Auth } from '@/lib/access'
import { getCollection } from '@/lib/http'
import { COLLECTIONS } from '@/lib/models'

/**
 * The weekly balance check: the user types one number, the balance of the
 * account their UPI is linked to, and the difference between what left that
 * account and what they logged is what they forgot. It keeps dashboard totals
 * right without bank linking or SMS access.
 *
 * Only one account, on purpose. Card bills get paid from it, so they show up
 * here too and are asked about only then; savings and salary accounts barely
 * move and aren't where anyone spends. Checks are cumulative: each one is
 * measured from the last settled check, so a skipped week is simply covered by
 * the next. No AI anywhere: this is arithmetic on the user's own history.
 */

export const CHECK_EVERY_DAYS = 7
/** How far back "the user's habits" reach, for the tolerance and the split. */
export const HISTORY_DAYS = 90
/** A card bill is compared with the card spends logged in this many days before it was paid. */
export const CARD_WINDOW_DAYS = 30
const MAX_SPLIT_ROWS = 3
/** A category under this share of the top three is folded into the others rather than shown as a sliver. */
const MIN_SPLIT_SHARE = 0.1
/** Everyday spends only: a rent-sized payment isn't what people forget, and would swallow the split. */
const EVERYDAY_MULTIPLE = 5
/** A card bill must beat the logged card spends by this much (and the tolerance) before we suggest they missed some. */
const CARD_MARGIN = 0.15

export type CheckKind = 'baseline' | 'square' | 'unlogged' | 'surplus'
/** `open` is a gap the user hasn't explained yet; the next check starts from the last check that isn't open. */
export type CheckStatus = 'baseline' | 'square' | 'open' | 'resolved'
export type MoneyInReason = 'income' | 'refund' | 'moved_in'
export const MONEY_IN_REASONS: readonly MoneyInReason[] = ['income', 'refund', 'moved_in']

export interface CheckExpense {
  timestamp: string
  amount: number
  category: string
  paymentMethod: string
  source: string
}

export interface SplitRow {
  category: string
  amount: number
  paymentMethod: 'bank' | 'credit_card'
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function time(ts: string): number {
  return Date.parse(ts)
}

/** An earlier check's estimate: never counted as something the user logged, or it would cancel the next gap. */
function isEstimate(e: CheckExpense): boolean {
  return e.source === 'balance_gap'
}

export function paidFromBank(e: CheckExpense): boolean {
  return e.paymentMethod !== 'credit_card' && e.paymentMethod !== 'cash'
}

export function paidByCard(e: CheckExpense): boolean {
  return e.paymentMethod === 'credit_card'
}

/** What the user logged themselves, paid the given way, after `fromTs` and up to `toTs`. */
export function spendBetween(expenses: CheckExpense[], fromTs: string, toTs: string, paid: (e: CheckExpense) => boolean): number {
  const from = time(fromTs)
  const to = time(toTs)
  let total = 0
  for (const e of expenses) {
    if (isEstimate(e) || !paid(e)) continue
    const at = time(e.timestamp)
    if (at > from && at <= to) total += e.amount
  }
  return round2(total)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function typicalSpend(history: CheckExpense[]): number {
  return median(history.filter((e) => !isEstimate(e) && e.amount > 0).map((e) => e.amount))
}

/**
 * A gap smaller than one typical purchase isn't worth a question. Capped at
 * 1% of the balance so a big-ticket spender's typical purchase can't hide a
 * real gap, and currency-agnostic because both halves come from the user's
 * own numbers.
 */
export function toleranceFor(lastBalance: number, history: CheckExpense[]): number {
  const typical = typicalSpend(history)
  const cap = Math.abs(lastBalance) * 0.01
  if (typical <= 0) return round2(cap)
  return round2(cap > 0 ? Math.min(typical, cap) : typical)
}

/** Positive gap: money left the account that wasn't logged. Negative: more money than expected. */
export function classify(gap: number, tolerance: number): Exclude<CheckKind, 'baseline'> {
  if (Math.abs(gap) <= tolerance) return 'square'
  return gap > 0 ? 'unlogged' : 'surplus'
}

/**
 * Spreads an unlogged amount across the envelopes the user usually spends on
 * this way: their top three by everyday spending over the history window,
 * whole units, the remainder on the biggest. No history means one row with no
 * envelope for the user to pick.
 */
export function splitByHabit(amount: number, history: CheckExpense[], paymentMethod: SplitRow['paymentMethod']): SplitRow[] {
  const total = Math.round(amount)
  if (total <= 0) return []
  const paid = paymentMethod === 'credit_card' ? paidByCard : paidFromBank
  // Measured within the same way of paying: card purchases run bigger than UPI ones.
  const everyday = typicalSpend(history.filter(paid)) * EVERYDAY_MULTIPLE

  const byCategory = new Map<string, number>()
  for (const e of history) {
    if (isEstimate(e) || !paid(e) || !e.category || e.amount <= 0) continue
    if (e.source === 'recurring' || e.source === 'subscription') continue
    if (everyday > 0 && e.amount > everyday) continue
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount)
  }
  let top = [...byCategory].sort((a, b) => b[1] - a[1]).slice(0, MAX_SPLIT_ROWS)
  if (top.length === 0) return [{ category: '', amount: total, paymentMethod }]

  const topSum = top.reduce((sum, [, v]) => sum + v, 0)
  top = top.filter(([, v]) => v / topSum >= MIN_SPLIT_SHARE)
  const keptSum = top.reduce((sum, [, v]) => sum + v, 0)
  const rows = top.map(([category, v]) => ({ category, amount: Math.floor((total * v) / keptSum), paymentMethod }))
  rows[0].amount += total - rows.reduce((sum, r) => sum + r.amount, 0)
  return rows.filter((r) => r.amount > 0)
}

/** How much of a card bill looks like card spends that were never logged, or 0 when it's within reason. */
export function cardShortfall(bill: number, loggedCardSpend: number, tolerance: number): number {
  const diff = bill - loggedCardSpend
  return diff > Math.max(tolerance, bill * CARD_MARGIN) ? Math.round(diff) : 0
}

/** Share of the bank's outflow the user logged themselves, as a whole percent. */
export function loggedPct(logged: number, forgotten: number): number {
  const total = logged + forgotten
  return total > 0 ? Math.round((100 * logged) / total) : 100
}

function daysBefore(ts: string, days: number): string {
  return new Date(time(ts) - days * 86_400_000).toISOString()
}

export function isDue(lastTs: string | null, nowTs: string): boolean {
  return !lastTs || time(nowTs) - time(lastTs) >= CHECK_EVERY_DAYS * 86_400_000
}

// --- storage -------------------------------------------------------------

export interface StoredCheck {
  _id: unknown
  timestamp: string
  date: string
  status: CheckStatus
  kind: CheckKind
  balance: number
  expected: number | null
  logged: number
  gap: number
  tolerance: number
  forgotten: number
  cardBill: number
  cardShortfall: number
  movedOut: number
  moneyIn: MoneyInReason | null
}

const num = (v: unknown): number => (v === undefined || v === null || v === '' ? 0 : Number(v) || 0)

/** Amounts are stored as strings so lib/scoped.ts can encrypt them, like every other money field. */
export function toStoredCheck(doc: Record<string, unknown>): StoredCheck {
  return {
    _id: doc._id,
    timestamp: String(doc.timestamp),
    date: String(doc.date),
    status: doc.status as CheckStatus,
    kind: doc.kind as CheckKind,
    balance: num(doc.balance),
    expected: doc.expected === undefined || doc.expected === null || doc.expected === '' ? null : Number(doc.expected),
    logged: num(doc.logged),
    gap: num(doc.gap),
    tolerance: num(doc.tolerance),
    forgotten: num(doc.forgotten),
    cardBill: num(doc.card_bill),
    cardShortfall: num(doc.card_shortfall),
    movedOut: num(doc.moved_out),
    moneyIn: (doc.money_in as MoneyInReason | undefined) ?? null,
  }
}

export async function checksCollection(auth: Auth) {
  return getCollection(COLLECTIONS.balanceChecks, auth)
}

/** The newest checks, newest first. Two is enough: an open check plus the settled one it's measured from. */
export async function latestChecks(auth: Auth, limit = 2): Promise<StoredCheck[]> {
  const coll = await checksCollection(auth)
  const docs = await coll.find({}).sort({ timestamp: -1 }).limit(limit).toArray()
  return docs.map((d) => toStoredCheck(d))
}

/** The check the next one is measured from: the newest that isn't an unexplained gap. */
export function anchorOf(checks: StoredCheck[]): StoredCheck | null {
  return checks.find((c) => c.status !== 'open') ?? null
}

/** Expenses from `sinceDate` on, reduced to what the check needs. Amounts are decrypted by the scoped read. */
export async function loadCheckExpenses(auth: Auth, sinceDate: string): Promise<CheckExpense[]> {
  const coll = await getCollection(COLLECTIONS.expenses, auth)
  const docs = await coll
    .find({ date: { $gte: sinceDate } }, { projection: { timestamp: 1, date: 1, amount_inr: 1, amount: 1, category: 1, payment_method: 1, source: 1 } })
    .toArray()
  return docs.map((d) => ({
    timestamp: d.timestamp ? String(d.timestamp) : `${String(d.date)}T00:00:00`,
    amount: Number(d.amount_inr ?? d.amount) || 0,
    category: String(d.category ?? ''),
    paymentMethod: String(d.payment_method || 'bank'),
    source: String(d.source || 'manual'),
  }))
}

export function historyStart(nowTs: string, anchorDate?: string): string {
  const start = daysBefore(nowTs, HISTORY_DAYS).slice(0, 10)
  return anchorDate && anchorDate < start ? anchorDate : start
}

export function cardWindowStart(nowTs: string): string {
  return daysBefore(nowTs, CARD_WINDOW_DAYS)
}

// --- proposals -----------------------------------------------------------

export interface GapProposalItem {
  id: string
  item: string
  amount: number
  splitWays: 1
  date: string
  category: string
  categoryConfidence: null
  paymentMethod: SplitRow['paymentMethod']
}

/**
 * Estimated rows in the same shape as a money-brain capture proposal, so the
 * app reviews them on the same card. The proposal id is the check's id, which
 * makes each row's client_id (`gap:<checkId>:<rowId>`) stable: asking again
 * after a lost response can never log the estimate twice.
 */
export function gapProposal(checkId: string, date: string, rows: SplitRow[]) {
  if (rows.length === 0) return null
  return {
    id: checkId,
    items: rows.map<GapProposalItem>((r, i) => ({
      id: `g${i + 1}`,
      item: r.paymentMethod === 'credit_card' ? 'Unlogged card spends' : 'Unlogged spends',
      amount: r.amount,
      splitWays: 1,
      date,
      category: r.category,
      categoryConfidence: null,
      paymentMethod: r.paymentMethod,
    })),
    skipped: [] as string[],
    unparsed: [] as string[],
  }
}
