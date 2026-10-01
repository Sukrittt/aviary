// Ported from Web/src/services/budgetLoader.ts::computeEnvelopes — same math,
// adapted to Mobile's row types (BudgetRow/ExpenseRow have string number fields).
// Do not change the formulas without checking the web version stays in sync.
import type { BudgetRow, CategoryRow, ExpenseRow } from '@/src/types'
import { toISTDateString } from './date'

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

export const CREDIT_CARD_CATEGORY = '__credit_card__'
export const INCOME_CATEGORY = '__income__'

export function currentMonthKey(date: Date = new Date()): string {
  return toISTDateString(date).slice(0, 7)
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
  const [y, m, d] = toISTDateString().split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  return daysInMonth - d
}

/** This month's income extra that makes Ready to Assign land on
 * `targetReadyToAssign` while leaving the monthly income alone. */
export function extraForReadyToAssign(incomeBase: number, totalAssigned: number, targetReadyToAssign: number): number {
  return Math.round((targetReadyToAssign + totalAssigned - incomeBase) * 100) / 100
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

  const monthBudgets = budgets.filter((b) => b.month === currentMonth)
  const prevMonthBudgets = budgets.filter((b) => b.month < currentMonth)

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

  const budgetCategories = new Set(
    [...monthBudgets, ...prevMonthBudgets]
      .filter((b) => b.category !== INCOME_CATEGORY)
      .map((b) => b.category),
  )

  const allCategories = [...new Set([...categoryRows.map((c) => c.name), ...budgetCategories])]

  const envelopes: Envelope[] = []
  let totalAssigned = 0
  let totalSpent = 0

  for (const category of allCategories) {
    const isCC = category === CREDIT_CARD_CATEGORY
    const assigned = carriedAssigned(category)
    // Clean slate every month: unspent money does not carry forward. Prior
    // months' own assigned/spent stay untouched in their own rows.
    const computedRollover = 0

    const spent = monthSpending.get(category) ?? 0
    const available = assigned + computedRollover - spent

    if (!isCC) {
      totalAssigned += assigned
      totalSpent += spent
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
  const readyToAssign = Math.round((income - totalAssigned) * 100) / 100 || 0

  return {
    month: currentMonth,
    income,
    incomeBase,
    incomeExtra,
    totalAssigned,
    totalSpent,
    readyToAssign,
    envelopes,
    isOverAssigned: readyToAssign < 0,
    groups: groupNames.filter((g) => envelopes.some((e) => e.group === g)),
  }
}
