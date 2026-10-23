// Ported from Web/src/services/budgetLoader.ts::computeEnvelopes — same math,
// adapted to Mobile's row types (BudgetRow/ExpenseRow have string number fields).
// Do not change the formulas without checking the web version stays in sync.
import type { BudgetRow, CategoryRow, ExpenseRow } from '@/src/types'
import { toLocalDateString } from './date'

export interface Envelope {
  category: string
  group: string
  assigned: number
  spent: number
  available: number
  rolledOver: number
  isOverspent: boolean
  spentPct: number
  isCreditCardPayment: boolean
  lastSpentDate?: string
}

export interface EnvelopeState {
  month: string
  /** incomeBase + incomeExtra. */
  income: number
  /** Monthly income. Carries into later months like any assignment. */
  incomeBase: number
  /** One-off income for this month only (a bonus, a refund, a top-up). Never
   * carries, so it can't repeat next month. Can be negative when there's less
   * than the monthly income this month. */
  incomeExtra: number
  totalAssigned: number
  totalSpent: number
  readyToAssign: number
  /** The part of readyToAssign last month left unassigned. Negative when it was over-assigned. */
  carriedReadyToAssign: number
  isOverAssigned: boolean
  envelopes: Envelope[]
  groups: string[]
}

interface BudgetNum {
  month: string
  category: string
  assigned: number
  rolledOver: number
}
interface ExpenseNum {
  date: string
  amountInr: number
  category: string
}

/** What earlier months left behind, from `GET /api/budgets/carry` (the server
 * computes it: see lib/budgetCarry.ts). `ready_to_assign` is only the carried
 * part, not the month's whole Ready to assign. */
export interface Carry {
  ready_to_assign: number
  rolled_over: Record<string, number>
}

export const CREDIT_CARD_CATEGORY = '__credit_card__'
export const INCOME_CATEGORY = '__income__'

/**
 * Where `amount` moved out of an envelope comes from: carried money first (so
 * the monthly target survives), then this month's `assigned` down to 0, and
 * anything past that as a one-month overdraw. The carried part is written as
 * the row's `rolled_over` adjustment, never as a lower `assigned`, because
 * `assigned` carries forward as next month's target too.
 */
export function splitDebit(amount: number, assigned: number, carry: number): { fromAssigned: number; fromCarry: number } {
  const fromCarried = Math.min(amount, Math.max(carry, 0))
  const fromAssigned = Math.round(Math.min(amount - fromCarried, Math.max(assigned, 0)) * 100) / 100
  return { fromAssigned, fromCarry: Math.round((amount - fromAssigned) * 100) / 100 }
}

export function currentMonthKey(date: Date = new Date()): string {
  return toLocalDateString(date).slice(0, 7)
}

export function prevMonthKey(key: string): string {
  return shiftMonthKey(key, -1)
}

/** Month key `delta` months away from `key`. Negative goes back. */
export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "2026-08" -> "August 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

/** "2026-08" -> "Aug". */
export function monthAbbrev(key: string): string {
  const [, m] = key.split('-').map(Number)
  return MONTH_NAMES[m - 1].slice(0, 3)
}

export function daysLeftInMonth(): number {
  const [y, m, d] = toLocalDateString().split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  return daysInMonth - d
}

/** This month's income extra that makes Ready to Assign land on
 * `targetReadyToAssign` while leaving the monthly income alone. `carried` is
 * what Ready to assign already brought in from last month. */
export function extraForReadyToAssign(incomeBase: number, totalAssigned: number, targetReadyToAssign: number, carried = 0): number {
  return Math.round((targetReadyToAssign + totalAssigned - incomeBase - carried) * 100) / 100
}

function monthSpendingByCategory(expenses: ExpenseNum[], month: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const e of expenses) {
    if (!e.date.startsWith(month)) continue
    map.set(e.category, (map.get(e.category) ?? 0) + e.amountInr)
  }
  return map
}

function lastSpentByCategory(expenses: ExpenseNum[], known: Record<string, string> = {}): Map<string, string> {
  const map = new Map<string, string>(Object.entries(known))
  for (const e of expenses) {
    if (!e.date) continue
    const current = map.get(e.category)
    if (!current || e.date > current) map.set(e.category, e.date)
  }
  return map
}

export function computeEnvelopeState(
  budgetRows: BudgetRow[],
  expenseRows: ExpenseRow[],
  currentMonth: string,
  categoryRows: CategoryRow[],
  groupNames: string[],
  // All-time last spend date per category, from `GET /api/expenses?from=`. Needed
  // because `expenseRows` may only cover recent months.
  lastSpent?: Record<string, string>,
  // Last month's leftovers. Omitted means nothing carries (a client that
  // hasn't loaded it yet, or a month before rollover started).
  carry?: Carry,
): EnvelopeState {
  const budgets: BudgetNum[] = budgetRows.map((b) => ({
    month: b.month,
    category: b.category,
    assigned: Number(b.assigned) || 0,
    rolledOver: Number(b.rolled_over) || 0,
  }))
  const expenses: ExpenseNum[] = expenseRows.map((e) => ({
    date: e.date,
    amountInr: Number(e.amount_inr) || 0,
    category: e.category,
  }))

  const budgetsByCategory = new Map<string, BudgetNum[]>()
  for (const b of budgets) {
    const arr = budgetsByCategory.get(b.category) ?? []
    arr.push(b)
    budgetsByCategory.set(b.category, arr)
  }
  // No "start new month" flow exists — a category (income included) with no
  // row yet this month carries forward the most recent prior month's assigned
  // amount, until the user changes it. An explicit row for this month (even
  // assigned: 0) always wins over the carried value. Credit Card Payment is
  // excluded: it's money set aside to pay off *last* month's card spending,
  // not a recurring budget target, so it always starts at 0 for a new month.
  function carriedAssigned(category: string): number {
    const rows = budgetsByCategory.get(category) ?? []
    const curr = rows.find((b) => b.month === currentMonth)
    if (curr) return curr.assigned
    if (category === CREDIT_CARD_CATEGORY) return 0
    const prior = [...rows].filter((b) => b.month < currentMonth).sort((a, b) => b.month.localeCompare(a.month))[0]
    return prior?.assigned ?? 0
  }

  const incomeBase = carriedAssigned(INCOME_CATEGORY)
  const incomeRow = budgetRows.find((b) => b.month === currentMonth && b.category === INCOME_CATEGORY)
  const incomeExtra = Number(incomeRow?.extra) || 0
  const income = Math.round((incomeBase + incomeExtra) * 100) / 100

  const monthSpending = monthSpendingByCategory(expenses, currentMonth)
  const lastSpentByCat = lastSpentByCategory(expenses, lastSpent)

  const categoryGroup = new Map<string, string>()
  for (const c of categoryRows) categoryGroup.set(c.name, c.group ?? '')

  // The category list owns envelope membership. Historical budget rows stay
  // on record after deletion, but must not recreate an envelope or reserve
  // its old assignment. The credit-card payment envelope is a system category
  // and can exist without a category row.
  const allCategories = new Set(categoryRows.map((c) => c.name).filter((name) => name !== INCOME_CATEGORY))
  if (budgets.some((b) => b.category === CREDIT_CARD_CATEGORY && b.month <= currentMonth)) {
    allCategories.add(CREDIT_CARD_CATEGORY)
  }

  const envelopes: Envelope[] = []
  let totalAssigned = 0
  // Deleting an envelope does not undo its spending. Include every real
  // expense so historical savings and leftover calculations stay accurate.
  const totalSpent = [...monthSpending.entries()]
    .filter(([category]) => category !== CREDIT_CARD_CATEGORY && category !== INCOME_CATEGORY)
    .reduce((sum, [, spent]) => sum + spent, 0)

  for (const category of allCategories) {
    const isCC = category === CREDIT_CARD_CATEGORY
    const assigned = carriedAssigned(category)
    // Unspent (or overspent) money from earlier months stays in its envelope.
    const computedRollover = carry?.rolled_over[category] ?? 0

    const spent = monthSpending.get(category) ?? 0
    const available = assigned + computedRollover - spent

    if (!isCC) {
      totalAssigned += assigned
    }

    envelopes.push({
      category,
      group: isCC ? '' : (categoryGroup.get(category) ?? ''),
      assigned,
      spent,
      available,
      rolledOver: computedRollover,
      isOverspent: available < 0,
      spentPct: assigned > 0 ? Math.min(100, (spent / assigned) * 100) : spent > 0 ? 100 : 0,
      isCreditCardPayment: isCC,
      lastSpentDate: lastSpentByCat.get(category),
    })
  }

  // Rounded to paise (2dp), not whole rupees — assigned amounts can carry
  // decimals, and a coarser round here silently dropped them from the one
  // number the envelope method is about.
  // A deleted envelope's spending this month still left the account. With no
  // envelope to hold it, it comes out of Ready to assign, the same as
  // lib/budgetCarry.ts's carryFrom hands it on to next month.
  let unlistedSpent = 0
  for (const [category, spent] of monthSpending) {
    if (category && category !== CREDIT_CARD_CATEGORY && category !== INCOME_CATEGORY && !allCategories.has(category)) unlistedSpent += spent
  }

  const carriedReadyToAssign = carry?.ready_to_assign ?? 0
  const readyToAssign = Math.round((carriedReadyToAssign + income - totalAssigned - unlistedSpent) * 100) / 100 || 0

  return {
    month: currentMonth,
    income,
    incomeBase,
    incomeExtra,
    totalAssigned,
    totalSpent,
    readyToAssign,
    carriedReadyToAssign,
    envelopes,
    isOverAssigned: readyToAssign < 0,
    groups: groupNames.filter((g) => envelopes.some((e) => e.group === g)),
  }
}

/**
 * Home's note under a negative Ready to assign: "₹5,000 more planned than
 * coming in". Usually it's a new month copying last month's plan after a
 * one-off extra paid for it. Null when nothing's over.
 */
export function overPlannedLine(readyToAssign: number, money: (amount: number) => string): string | null {
  return readyToAssign < 0 ? `${money(-readyToAssign)} more planned than coming in` : null
}

/** Where to trim an over-planned month: the biggest plans first. The card
 * payoff isn't a plan, it's last month's card spending, so it's left out. */
export function trimCandidates<E extends { assigned: number; isCreditCardPayment?: boolean }>(envelopes: E[], n = 3): E[] {
  return envelopes
    .filter((e) => !e.isCreditCardPayment && e.assigned > 0)
    .sort((a, b) => b.assigned - a.assigned)
    .slice(0, n)
}

