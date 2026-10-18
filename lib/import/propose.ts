import { analyzeCadence, normalizeItem } from '@/lib/recurringDetection'
import { MAX_ACCOUNTS, MAX_ACCOUNT_NAME, MAX_BANK_ACCOUNTS, type AccountType } from '@/lib/accounts'
import type { StoredRow } from './normalize'

/**
 * What the review screen proposes from the rows: envelopes, accounts, the
 * salary and this month's budget. Pure functions over resolved rows (see
 * `resolveRows`), so preview and commit compute the same thing.
 */

export const CATEGORY_NAME_MAX = 60
export const UNCATEGORISED = 'Uncategorised'
const MAX_CATEGORIES = 40

export function categoryKey(row: StoredRow, joinSub: boolean): string {
  const name = joinSub && row.subcategory ? `${row.category} · ${row.subcategory}` : row.category
  return (name.trim() || UNCATEGORISED).slice(0, CATEGORY_NAME_MAX)
}

export interface CategoryPlan {
  joinSub: boolean
  /** Source categories by spend, merged when they differ only in case or spacing. */
  list: { source: string; spent: number }[]
  /** The source category a row files under, after that merge. */
  sourceOf: (row: StoredRow) => string
}

function categoriesAt(expenses: StoredRow[], joinSub: boolean): CategoryPlan {
  const names = new Map<string, string>()
  const spent = new Map<string, number>()
  for (const r of expenses) {
    const key = categoryKey(r, joinSub)
    const norm = normalizeItem(key) || key
    if (!names.has(norm)) names.set(norm, key)
    const display = names.get(norm)!
    spent.set(display, (spent.get(display) ?? 0) + r.amount)
  }
  return {
    joinSub,
    list: [...spent].map(([source, total]) => ({ source, spent: Math.round(total * 100) / 100 })).sort((a, b) => b.spent - a.spent),
    sourceOf: (r) => {
      const key = categoryKey(r, joinSub)
      return names.get(normalizeItem(key) || key) ?? key
    },
  }
}

export function proposeCategories(rows: StoredRow[]): CategoryPlan {
  const expenses = rows.filter((r) => r.kind === 'expense')
  const withSub = categoriesAt(expenses, true)
  return capped(withSub.list.length > MAX_CATEGORIES ? categoriesAt(expenses, false) : withSub)
}

/** The top categories by spend, the rest folded into Uncategorised, so a free-text column can't flood the review or the commit. */
function capped(plan: CategoryPlan): CategoryPlan {
  if (plan.list.length <= MAX_CATEGORIES) return plan
  const other = normalizeItem(UNCATEGORISED)
  const otherName = plan.list.find((c) => normalizeItem(c.source) === other)?.source ?? UNCATEGORISED
  const kept = plan.list.filter((c) => c.source !== otherName).slice(0, MAX_CATEGORIES - 1)
  const keep = new Set(kept.map((c) => c.source))
  const folded = plan.list.filter((c) => !keep.has(c.source)).reduce((sum, c) => sum + c.spent, 0)
  return {
    joinSub: plan.joinSub,
    list: [...kept, { source: otherName, spent: Math.round(folded * 100) / 100 }].sort((a, b) => b.spent - a.spent),
    sourceOf: (r) => {
      const source = plan.sourceOf(r)
      return keep.has(source) ? source : otherName
    },
  }
}

export function guessAccountType(name: string): AccountType {
  if (/debit/i.test(name)) return 'bank'
  if (/credit|card|visa|master|amex|rupay/i.test(name)) return 'credit_card'
  if (/cash|wallet/i.test(name)) return 'cash'
  return 'bank'
}

/** The name clipped to the app's limit, numbered when clipping makes it match one already taken. */
function uniqueName(source: string, taken: string[]): string {
  const used = new Set(taken.map((t) => t.toLowerCase()))
  let name = source.slice(0, MAX_ACCOUNT_NAME).trim()
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${source.slice(0, MAX_ACCOUNT_NAME - String(n).length - 1).trimEnd()} ${n}`
  return name
}

/** Accounts by how often they appear, inside the app's caps. The rest are named so the review can say so. */
export function proposeAccounts(rows: StoredRow[]): { accounts: { source: string; name: string; type: AccountType }[]; dropped: string[] } {
  const seen = new Map<string, { source: string; n: number }>()
  for (const r of rows) {
    const key = r.account.trim().toLowerCase()
    if (!key) continue
    const entry = seen.get(key) ?? { source: r.account.trim(), n: 0 }
    entry.n++
    seen.set(key, entry)
  }
  const accounts: { source: string; name: string; type: AccountType }[] = []
  const dropped: string[] = []
  for (const { source } of [...seen.values()].sort((a, b) => b.n - a.n)) {
    const type = guessAccountType(source)
    const banks = accounts.filter((a) => a.type === 'bank').length
    if (accounts.length >= MAX_ACCOUNTS || (type === 'bank' && banks >= MAX_BANK_ACCOUNTS)) dropped.push(source)
    else accounts.push({ source, name: uniqueName(source, accounts.map((a) => a.name)), type })
  }
  return { accounts, dropped }
}

export function incomeKey(row: StoredRow): string {
  return normalizeItem(row.item || row.category)
}

const DAY_MS = 86_400_000
const SALARY_FRESH_DAYS = 62

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The salary: among income labels paid monthly, the one with the largest
 * typical amount. Proposes the most recent amount and its day. A pattern
 * that stopped more than two months ago isn't a salary any more.
 */
export function detectSalary(rows: StoredRow[], today: string): { key: string; label: string; amount: number; day: number } | null {
  const groups = new Map<string, StoredRow[]>()
  for (const r of rows) {
    if (r.kind !== 'income') continue
    const key = incomeKey(r)
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(r)
    else groups.set(key, [r])
  }
  let best: { key: string; typical: number; last: StoredRow } | null = null
  for (const [key, group] of groups) {
    if (new Set(group.map((r) => r.date)).size < 2) continue
    if (analyzeCadence(group.map((r) => r.date)).deterministicCadence !== 'monthly') continue
    const last = group.reduce((a, b) => (b.date >= a.date ? b : a))
    if ((Date.parse(today) - Date.parse(last.date)) / DAY_MS > SALARY_FRESH_DAYS) continue
    const typical = median(group.map((r) => r.amount))
    if (!best || typical > best.typical) best = { key, typical, last }
  }
  if (!best) return null
  return { key: best.key, label: (best.last.item || best.last.category).trim(), amount: best.last.amount, day: Number(best.last.date.slice(8, 10)) }
}

// ponytail: a hand list, since every currency formats with two decimals here; add a per-currency field if this grows.
const SMALL_AMOUNT_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'NZD', 'SGD', 'KWD', 'BHD', 'OMR', 'JOD'])

/** What a budget prefill rounds up to: 10 where everyday amounts are small, 100 elsewhere. */
export function budgetStep(currency: string): 10 | 100 {
  return SMALL_AMOUNT_CURRENCIES.has(currency) ? 10 : 100
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7)
}

/**
 * This month's assignment per category: the average spend over the last
 * three complete months, rounded up to the step. A file that starts inside
 * that window divides by the months it covers, so a new tracker isn't
 * budgeted at a third of its spend. A file that ends before the window
 * uses its own last three complete months. A YNAB plan amount for this month wins.
 */
export function proposeBudgets(
  rows: StoredRow[],
  categoryOf: (row: StoredRow) => string,
  today: string,
  currency: string,
  plan: Record<string, number>,
): Record<string, number> {
  // A file that stopped before the window is averaged over its own last
  // complete months, so an old export doesn't open with every envelope at 0.
  const lastSpend = rows.reduce((max, r) => (r.kind === 'expense' && r.date > max ? r.date : max), '').slice(0, 7)
  const current = lastSpend && lastSpend < shiftMonth(today.slice(0, 7), -3) ? lastSpend : today.slice(0, 7)
  const window = [shiftMonth(current, -3), shiftMonth(current, -2), shiftMonth(current, -1)]
  const first = rows.reduce((min, r) => (r.date < min ? r.date : min), today).slice(0, 7)
  const covered = Math.max(1, window.filter((m) => m >= first).length)
  const sums = new Map<string, number>()
  for (const r of rows) {
    if (r.kind !== 'expense' || !window.includes(r.date.slice(0, 7))) continue
    const name = categoryOf(r)
    sums.set(name, (sums.get(name) ?? 0) + r.amount)
  }
  const step = budgetStep(currency)
  const out: Record<string, number> = {}
  // Refunds are negative spends, so they net out; one that outweighs the spend leaves the envelope at 0.
  for (const [name, sum] of sums) out[name] = Math.max(0, Math.ceil(Math.round((sum / covered) * 100) / 100 / step) * step)
  return { ...out, ...plan }
}

/** How an imported income row counts: only this month's salary is already in `assigned`. */
export function incomeCounted(row: StoredRow, salaryKey: string | null, currentMonth: string): 'monthly' | 'extra' {
  return salaryKey !== null && incomeKey(row) === salaryKey && row.date.slice(0, 7) === currentMonth ? 'monthly' : 'extra'
}
