import { formatMoney } from '@/src/lib/currencies'
/**
 * Builds the dashboard's derived panel from raw API rows.
 *
 * This was src/services/expensePanelLoader.ts, which fetched and derived in one
 * async call. Fetching now belongs to the hooks in src/hooks/, so what is left
 * is pure: the same derivations over rows the caller already has, memoisable
 * and testable without a network.
 *
 * The concepts here (a monthly spend cap, an essential/discretionary split,
 * the alert lines) are web-only — mobile has no equivalent, so unlike the rest
 * of src/lib/ this file has no twin to stay in step with.
 */
import type { BudgetRow, CategoryRow, ExpenseRow, SubscriptionRow } from '@/src/types'
import { computeEnvelopeState, currentMonthKey } from './envelope'
import type { ExpensePanelContract } from '@/src/services/expensePanelAdapter'

/** Categories that count as essential when splitting the month's spend. */
const ESSENTIAL_CATEGORIES = new Set(['Bills', 'Food', 'Travel', 'Personal care'])

const MONTHLY_SPEND_CAP_INR = 45000
const DAILY_SOFT_CAP_INR = 1500

/** Share of discretionary spend above which the panel says something. */
const DISCRETIONARY_ALERT_PCT = 60

export function buildExpensePanel(input: {
  currencyCode?: string
  budgets: BudgetRow[]
  expenses: ExpenseRow[]
  // All-time last spend date per category; see computeEnvelopeState.
  lastSpent?: Record<string, string>
  subscriptions: SubscriptionRow[]
  categories: CategoryRow[]
  groups: string[]
  /** Overridable so a test can pin the month. */
  month?: string
}): ExpensePanelContract {
  const { budgets, expenses, subscriptions, categories, groups } = input
  const month = input.month ?? currentMonthKey()

  const rows = expenses.map((e) => ({
    timestamp: e.timestamp,
    date: e.date,
    item: e.item,
    amountInr: Number(e.amount_inr) || 0,
    category: e.category,
  }))

  const monthRows = rows.filter((e) => e.date.startsWith(month))
  const monthSpend = monthRows.reduce((sum, e) => sum + e.amountInr, 0)
  const essentialSpend = monthRows
    .filter((e) => ESSENTIAL_CATEGORIES.has(e.category))
    .reduce((sum, e) => sum + e.amountInr, 0)
  const discretionarySpend = monthSpend - essentialSpend

  const catTotals = new Map<string, number>()
  for (const e of monthRows) catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + e.amountInr)
  const topCategories = [...catTotals.entries()]
    .map(([category, amountInr]) => ({ category, amountInr }))
    .sort((a, b) => b.amountInr - a.amountInr)

  // Every row, not just this month's, so the period filters have history.
  const dayTotals = new Map<string, number>()
  for (const e of rows) dayTotals.set(e.date, (dayTotals.get(e.date) ?? 0) + e.amountInr)
  const dailySpend = [...dayTotals.entries()]
    .map(([date, amountInr]) => ({ date, amountInr }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const envelopeState = computeEnvelopeState(budgets, expenses, month, categories, groups, input.lastSpent)

  const alerts: string[] = []
  if (envelopeState.isOverAssigned) {
    alerts.push(`Over-assigned by ${formatMoney(Math.abs(envelopeState.readyToAssign), input.currencyCode)} — reduce category budgets.`)
  }
  const discretionaryPct = monthSpend > 0 ? (discretionarySpend / monthSpend) * 100 : 0
  if (discretionaryPct > DISCRETIONARY_ALERT_PCT) {
    alerts.push('Discretionary share above 60%; trigger cooling rule for non-essential purchases this week.')
  }

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      month,
      monthlySpendCapInr: MONTHLY_SPEND_CAP_INR,
      dailySoftCapInr: DAILY_SOFT_CAP_INR,
    },
    totals: {
      monthSpendInr: monthSpend,
      essentialSpendInr: essentialSpend,
      discretionarySpendInr: discretionarySpend,
      duesReceivableInr: 0,
    },
    topCategories,
    dailySpend,
    expenseRows: rows,
    envelopeState,
    alerts,
    // The CSV-era deep links pointed at files that no longer exist; the data
    // has been in Mongo since the migration.
    deepLinks: [],
    subscriptions: subscriptions.map((s) => ({
      timestamp: s.timestamp,
      service: s.service,
      amountInr: Number(s.amount_inr) || 0,
      billingCycle: s.billing_cycle,
      nextDueDate: s.next_due_date ?? '',
      status: s.status,
      renewalOrEndMonth: s.renewal_or_end_month,
      notes: s.notes ?? '',
      category: s.category ?? '',
    })),
  }
}
