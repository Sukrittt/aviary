import { currencyInstruction } from '@/lib/ai/moneyBrainPrompt'
import { getUserCurrency, nowForUser } from '@/lib/userCurrency'
import { computeEnvelopeState } from '@/src/lib/envelope'
import { savingsTrend } from '@/src/lib/monthly'
import { getCollection } from '@/lib/http'
import type { Auth } from '@/lib/access'
import type { Envelope } from '@/src/lib/envelope'
import { paceOutlier, type PaceOutlier } from '@/lib/notifications/pace'
import type { BudgetRow as WireBudgetRow, ExpenseRow as WireExpenseRow } from '@/src/types'

/**
 * Builds the plain-text "FACTS" context fed to the money-brain Gemini
 * prompts (brief + chat). Kept as plain text rather than JSON — cheaper in
 * tokens for the same information.
 */

/**
 * The FACTS text is built as named sections so a caller can send Gemini only
 * the parts a question actually needs. `transactions` alone is most of the
 * payload, so dropping it is the difference between a ~20k and a ~4k prompt.
 * Order here is the order sections appear in the joined text.
 */
export const FACT_SECTIONS = ['header', 'envelopes', 'trend', 'top10', 'subscriptions', 'investments', 'transactions'] as const
export type FactSection = (typeof FACT_SECTIONS)[number]
export type FactSections = Record<FactSection, string>

/** Joins the chosen sections in canonical order, ignoring repeats. */
export function factsFor(sections: FactSections, pick: readonly FactSection[]): string {
  const wanted = new Set(pick)
  return FACT_SECTIONS.filter((s) => wanted.has(s))
    .map((s) => sections[s])
    .join('\n\n')
}

const SENTINEL_INCOME = '__income__'
const SENTINEL_CREDIT_CARD = '__credit_card__'
const TXN_HISTORY_DAYS = 90
const TXN_CAP = 400
const TREND_MONTHS = 6

export interface ExpenseRow {
  timestamp?: string
  date: string
  item?: string
  amount_inr: number
  category: string
  notes?: string
  payment_method?: string
}

export interface BudgetDocRow {
  month: string
  category: string
  assigned: number
  rolled_over: number
  extra?: number
}

export interface CategoryDocRow {
  name: string
  group?: string
  alertPcts?: number[]
}

export interface GroupDocRow {
  name: string
}

export interface SubscriptionDocRow {
  service: string
  amount_inr: number
  billing_cycle?: string
  next_due_date?: string
  renewal_or_end_month?: string
  timestamp?: string
  status?: string
}

export interface HoldingDocRow {
  name: string
  type?: string
  value: number
  updated_at?: string
}

export interface SummarizeExpensesInput {
  expenses: ExpenseRow[]
  budgets: BudgetDocRow[]
  categories: CategoryDocRow[]
  groups: GroupDocRow[]
  subscriptions: SubscriptionDocRow[]
  holdings: HoldingDocRow[]
  currentMonth: string // 'YYYY-MM'
  today: string // 'YYYY-MM-DD'
}

export interface SummarizeExpensesMeta {
  txnCountThisMonth: number
  totalSpent: number
  totalAssigned: number
  daysLeft: number
  daysElapsed: number
  totalDaysInMonth: number
}

/**
 * Figures the brief's candidate cards need that aren't already on `envelopes`
 * or `meta`. Computed here because this is where the trend table and the
 * month's sorted items already exist.
 */
export interface FactHighlights {
  topItem: { item: string; amount: number; category: string; date: string } | null
  /** Category whose spend this month is furthest above its own recent average. */
  riser: { category: string; thisMonth: number; priorAverage: number } | null
  /** Category furthest ahead of its usual month-to-date pace (lib/notifications/pace.ts). */
  pace: PaceOutlier | null
  subscriptionMonthlyBurn: number
  investmentTotal: number
}

export interface SummarizeExpensesResult {
  currencyCode?: string
  facts: string
  sections: FactSections
  highlights: FactHighlights
  meta: SummarizeExpensesMeta
  envelopes: Envelope[]
  subscriptions: SubscriptionDocRow[]
  categories: CategoryDocRow[]
}

function round(n: number): number {
  return Math.round(n) || 0
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate()
}

/** Last `n` months (inclusive of `currentMonth`), oldest first, as 'YYYY-MM'. */
function lastNMonths(currentMonth: string, n: number): string[] {
  const [y, m] = currentMonth.split('-').map(Number)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

/** How many months a billing cycle spans, for converting to a monthly-equivalent amount. */
function cycleMonths(cycle?: string): number {
  switch ((cycle ?? '').toLowerCase()) {
    case 'weekly':
      return 12 / 52
    case 'biweekly':
      return 12 / 26
    case 'quarterly':
      return 3
    case 'half-yearly':
    case 'semi-annual':
    case 'halfyearly':
      return 6
    case 'yearly':
    case 'annual':
    case 'annually':
      return 12
    case 'monthly':
    default:
      return 1
  }
}

/**
 * Category furthest above its own average of the earlier trend months. Needs
 * at least two earlier months with spend, so one heavy first month in a new
 * category doesn't read as a spike.
 */
function pickRiser(
  totals: Map<string, Map<string, number>>,
  trendMonths: string[],
): FactHighlights['riser'] {
  const current = trendMonths[trendMonths.length - 1]
  const earlier = trendMonths.slice(0, -1)
  let best: FactHighlights['riser'] = null
  let bestDelta = 0
  for (const [category, monthMap] of totals) {
    const thisMonth = monthMap.get(current) ?? 0
    if (thisMonth <= 0) continue
    const priorValues = earlier.map((m) => monthMap.get(m) ?? 0).filter((v) => v > 0)
    if (priorValues.length < 2) continue
    const priorAverage = priorValues.reduce((a, b) => a + b, 0) / priorValues.length
    const delta = thisMonth - priorAverage
    if (delta > bestDelta) {
      bestDelta = delta
      best = { category, thisMonth: round(thisMonth), priorAverage: round(priorAverage) }
    }
  }
  return best
}

export function summarizeExpenses(input: SummarizeExpensesInput): SummarizeExpensesResult {
  const { expenses, budgets, categories, groups, subscriptions, holdings, currentMonth, today } = input

  const [cy, cm] = currentMonth.split('-').map(Number)
  const totalDaysInMonth = daysInMonth(cy, cm)
  const daysElapsed = Math.min(Number(today.split('-')[2]) || 0, totalDaysInMonth)
  const daysLeft = Math.max(0, totalDaysInMonth - daysElapsed)

  // --- Envelope math (real categories only; sentinels handled separately below) ---
  const realCategories = categories
    .filter((c) => c.name !== SENTINEL_INCOME && c.name !== SENTINEL_CREDIT_CARD)
    .map((c) => ({ name: c.name, group: c.group ?? '' }))

  // computeEnvelopeState takes the API's wire rows (string fields), which is
  // what the client hands it. Server-side these come out of Mongo as numbers,
  // so they are stringified back rather than widening the shared signature and
  // letting it drift from its mobile twin.
  const budgetRows: WireBudgetRow[] = budgets.map((b) => ({
    month: b.month,
    category: b.category,
    assigned: String(b.assigned ?? 0),
    rolled_over: String(b.rolled_over ?? 0),
    extra: String(b.extra ?? 0),
    version: 0,
  }))

  const envelopeExpenseRows = expenses.map(
    (e): WireExpenseRow => ({
      timestamp: e.timestamp ?? '',
      date: e.date,
      item: e.item ?? '',
      amount_inr: String(e.amount_inr ?? 0),
      category: e.category,
      notes: e.notes ?? '',
      source: '',
      amount: '',
      description: '',
      payment_method: e.payment_method ?? '',
    }),
  )

  const groupNames = groups.map((g) => g.name)

  const envelopeState = computeEnvelopeState(budgetRows, envelopeExpenseRows, currentMonth, realCategories, groupNames)

  const income = envelopeState.income
  const ccEnvelope = envelopeState.envelopes.find((e) => e.isCreditCardPayment)

  // --- This month's transactions ---
  const monthExpenses = expenses.filter((e) => e.date.startsWith(currentMonth))
  const realMonthExpenses = monthExpenses.filter(
    (e) => e.category !== SENTINEL_INCOME && e.category !== SENTINEL_CREDIT_CARD,
  )

  const header = [
    `MONTH: ${currentMonth} (day ${daysElapsed} of ${totalDaysInMonth}, ${daysLeft} days left)`,
    '',
    envelopeState.incomeExtra === 0
      ? `INCOME: ${round(income)}`
      : `INCOME: ${round(income)} (monthly ${round(envelopeState.incomeBase)}, recurs; plus one-off ${round(envelopeState.incomeExtra)} this month only)`,
    `ASSIGNED THIS MONTH: ${round(envelopeState.totalAssigned)}`,
    `READY TO ASSIGN: ${round(envelopeState.readyToAssign)} (income not given to any envelope yet; recurs every month unless assignments change)`,
    ccEnvelope
      ? `CREDIT CARD: assigned ${round(ccEnvelope.assigned)}, charged ${round(ccEnvelope.spent)} this month, available ${round(ccEnvelope.available)}`
      : 'CREDIT CARD: no activity',
  ]

  const envelopeLines = ['ENVELOPES (category|group|assigned|spent|available|overspent):']
  for (const e of envelopeState.envelopes) {
    if (e.isCreditCardPayment) continue // reported separately in the header, not a spending envelope
    envelopeLines.push(
      `${e.category}|${e.group ?? ''}|${round(e.assigned)}|${round(e.spent)}|${round(e.available)}|${e.isOverspent ? 'yes' : 'no'}`,
    )
  }
  // Stated, not left to the model: flash-lite got these sums wrong.
  const spendingEnvelopes = envelopeState.envelopes.filter((e) => !e.isCreditCardPayment)
  const unspent = spendingEnvelopes.reduce((sum, e) => sum + Math.max(0, e.available), 0)
  const overspent = spendingEnvelopes.reduce((sum, e) => sum + Math.max(0, -e.available), 0)
  envelopeLines.push(
    `TOTALS: assigned ${round(envelopeState.totalAssigned)}, spent ${round(envelopeState.totalSpent)}, available ${round(unspent - overspent)} (unspent ${round(unspent)}, overspent ${round(overspent)})`,
    `LEFT THIS MONTH: ${round(unspent - overspent + envelopeState.readyToAssign)} (available plus ready to assign; answers "how much is left")`,
    `FREE FOR NEW COSTS: ${round(envelopeState.readyToAssign - overspent)} (ready to assign minus overspent; unspent envelope money is already promised)`,
  )

  // Trend: per-category totals for each of the last TREND_MONTHS months.
  const trendMonths = lastNMonths(currentMonth, TREND_MONTHS)
  const trendSet = new Set(trendMonths)
  const trendCategoryTotals = new Map<string, Map<string, number>>()
  for (const e of expenses) {
    if (e.category === SENTINEL_INCOME || e.category === SENTINEL_CREDIT_CARD) continue
    const month = e.date.slice(0, 7)
    if (!trendSet.has(month)) continue
    const catMap = trendCategoryTotals.get(e.category) ?? new Map<string, number>()
    catMap.set(month, (catMap.get(month) ?? 0) + (Number(e.amount_inr) || 0))
    trendCategoryTotals.set(e.category, catMap)
  }
  // Average over full months only: the current month is partial, and months
  // before the first expense aren't history (a new user would read as frugal).
  const firstMonth = [...trendCategoryTotals.values()].flatMap((m) => [...m.keys()]).sort()[0] ?? currentMonth
  const fullMonths = trendMonths.slice(0, -1).filter((m) => m >= firstMonth)
  const trendRow = (label: string, amountFor: (month: string) => number) => {
    const totals = trendMonths.map((m) => round(amountFor(m)))
    const avg = fullMonths.length ? round(fullMonths.reduce((sum, m) => sum + amountFor(m), 0) / fullMonths.length) : 0
    return { totals, line: `${label}|${totals.join('|')}|${avg}` }
  }
  const trendLines = [
    `TREND (category totals by month, last ${TREND_MONTHS} months; avg excludes the current month):`,
    `category|${trendMonths.join('|')}|avg full months`,
  ]
  for (const [category, monthMap] of [...trendCategoryTotals.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const row = trendRow(category, (m) => monthMap.get(m) ?? 0)
    if (row.totals.every((v) => v === 0)) continue
    trendLines.push(row.line)
  }
  trendLines.push(
    trendRow('TOTAL', (m) => [...trendCategoryTotals.values()].reduce((sum, monthMap) => sum + (monthMap.get(m) ?? 0), 0)).line,
  )
  // Envelopes reset every month, so this is the only record of money kept.
  // Expenses are loaded for the trend window only, so the total starts there at the earliest.
  const saved = savingsTrend(budgetRows, envelopeExpenseRows, realCategories, groupNames, currentMonth)
  if (saved.since) {
    const savedByMonth = new Map(saved.points.map((p) => [p.date, p.value]))
    const savedFull = fullMonths.filter((m) => savedByMonth.has(m))
    const savedAvg = savedFull.length ? round(savedFull.reduce((sum, m) => sum + savedByMonth.get(m)!, 0) / savedFull.length) : 0
    const cells = trendMonths.map((m) => (savedByMonth.has(m) ? String(round(savedByMonth.get(m)!)) : '-'))
    trendLines.push(`SAVED (income minus spending)|${cells.join('|')}|${savedAvg}`)
    const from = saved.since > trendMonths[0] ? saved.since : trendMonths[0]
    const total = saved.points.filter((p) => p.date >= from && p.date < currentMonth).reduce((sum, p) => sum + p.value, 0)
    trendLines.push(`SAVED SINCE ${from}: ${round(total)} (finished months; the running savings, since unspent envelope money does not carry over)`)
  }

  // Top 10 items this month by amount.
  const top10 = [...realMonthExpenses].sort((a, b) => (Number(b.amount_inr) || 0) - (Number(a.amount_inr) || 0)).slice(0, 10)
  const top10Lines = ['TOP 10 ITEMS THIS MONTH (date|item|amount|category):']
  for (const e of top10) {
    top10Lines.push(`${e.date}|${e.item ?? ''}|${round(Number(e.amount_inr) || 0)}|${e.category}`)
  }

  // Subscriptions with computed monthly burn.
  const subscriptionLines = ['SUBSCRIPTIONS (service|billing_cycle|amount|monthly_burn|status):']
  let totalMonthlyBurn = 0
  for (const s of subscriptions) {
    const amount = Number(s.amount_inr) || 0
    const monthlyBurn = amount / cycleMonths(s.billing_cycle)
    const status = s.status ?? ''
    const isActive = !['cancelled', 'canceled', 'ended', 'paused'].includes(status.toLowerCase())
    if (isActive) totalMonthlyBurn += monthlyBurn
    subscriptionLines.push(`${s.service}|${s.billing_cycle ?? ''}|${round(amount)}|${round(monthlyBurn)}|${status || 'active'}`)
  }
  subscriptionLines.push(`Total active monthly burn: ${round(totalMonthlyBurn)}`)

  // Investment holdings snapshot (not spending — reported separately from envelopes).
  const investmentLines = ['INVESTMENTS (name|type|value|updated_at):']
  let totalInvestmentValue = 0
  for (const h of holdings) {
    const value = round(Number(h.value) || 0)
    totalInvestmentValue += value
    investmentLines.push(`${h.name}|${h.type ?? ''}|${value}|${h.updated_at ?? ''}`)
  }
  investmentLines.push(`Total investment value: ${round(totalInvestmentValue)}`)

  // Last TXN_HISTORY_DAYS days of raw transactions, newest first, capped at TXN_CAP.
  const cutoff = new Date(`${today}T00:00:00`)
  cutoff.setDate(cutoff.getDate() - TXN_HISTORY_DAYS)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const recentTxns = expenses
    .filter((e) => e.date >= cutoffStr && e.date <= today)
    .sort((a, b) => {
      const byDate = b.date.localeCompare(a.date)
      if (byDate !== 0) return byDate
      return (b.timestamp ?? '').localeCompare(a.timestamp ?? '')
    })
    .slice(0, TXN_CAP)
  const txnLines = [
    `TRANSACTIONS (last ${TXN_HISTORY_DAYS} days, newest first, capped at ${TXN_CAP}; date|item|amount|category|payment_method):`,
  ]
  for (const e of recentTxns) {
    txnLines.push(`${e.date}|${e.item ?? ''}|${round(Number(e.amount_inr) || 0)}|${e.category}|${e.payment_method ?? ''}`)
  }
  // "How much at Starbucks?" meant the model adding dozens of rows, and it got those sums wrong.
  const merchants = new Map<string, { name: string; month: number; window: number; count: number }>()
  // From the whole window, not the capped rows above, so a heavy month doesn't undercount.
  for (const e of expenses) {
    if (e.date < cutoffStr || e.date > today) continue
    if (!e.item || e.category === SENTINEL_INCOME || e.category === SENTINEL_CREDIT_CARD) continue
    const key = e.item.trim().toLowerCase()
    const m = merchants.get(key) ?? { name: e.item.trim(), month: 0, window: 0, count: 0 }
    const amount = Number(e.amount_inr) || 0
    m.window += amount
    m.count += 1
    if (e.date.startsWith(currentMonth)) m.month += amount
    merchants.set(key, m)
  }
  const repeatMerchants = [...merchants.values()].filter((m) => m.count > 1).sort((a, b) => b.window - a.window)
  if (repeatMerchants.length) {
    txnLines.push('', `REPEAT ITEMS (item|this month|last ${TXN_HISTORY_DAYS} days|count in ${TXN_HISTORY_DAYS} days):`)
    for (const m of repeatMerchants) txnLines.push(`${m.name}|${round(m.month)}|${round(m.window)}|${m.count}`)
  }

  const topExpense = top10[0]
  const riser = pickRiser(trendCategoryTotals, trendMonths)

  const sections: FactSections = {
    header: header.join('\n'),
    envelopes: envelopeLines.join('\n'),
    trend: trendLines.join('\n'),
    top10: top10Lines.join('\n'),
    subscriptions: subscriptionLines.join('\n'),
    investments: investmentLines.join('\n'),
    transactions: txnLines.join('\n'),
  }

  const facts = factsFor(sections, FACT_SECTIONS)

  return {
    facts,
    sections,
    highlights: {
      topItem: topExpense
        ? {
            item: topExpense.item ?? '',
            amount: round(Number(topExpense.amount_inr) || 0),
            category: topExpense.category,
            date: topExpense.date,
          }
        : null,
      riser,
      pace: paceOutlier(expenses, today),
      subscriptionMonthlyBurn: round(totalMonthlyBurn),
      investmentTotal: round(totalInvestmentValue),
    },
    meta: {
      txnCountThisMonth: monthExpenses.length,
      totalSpent: round(envelopeState.totalSpent),
      totalAssigned: round(envelopeState.totalAssigned),
      daysLeft,
      daysElapsed,
      totalDaysInMonth,
    },
    envelopes: envelopeState.envelopes,
    subscriptions,
    categories,
  }
}

/** First day of the oldest month the FACTS text reports on, as 'YYYY-MM-DD'. */
export function factsWindowStart(today: string): string {
  return `${lastNMonths(today.slice(0, 7), TREND_MONTHS)[0]}-01`
}

/**
 * Fetches the collections the money-brain context needs and builds `facts`.
 *
 * Expenses are bounded to the trend window. Nothing in the FACTS text reaches
 * further back (envelopes are this month, the trend is TREND_MONTHS months,
 * transactions are 90 days), so an account with years of history costs the
 * same as a new one. Budgets stay unbounded: a category with no row this month
 * carries its most recent prior assignment forward, however old that row is,
 * and those documents are one per month per category.
 */
export async function buildExpenseContext(
  auth: Auth,
  // `monthOnly`: current month of expenses only. Envelopes, `meta` and the
  // threshold levels built from them stay exact; the trend and transaction
  // FACTS go thin, so only callers that never read `facts` should set it.
  { monthOnly = false }: { monthOnly?: boolean } = {},
): Promise<SummarizeExpensesResult> {
  const { date: today } = await nowForUser(auth.userId)

  const [expensesColl, budgetsColl, categoriesColl, groupsColl, subscriptionsColl, holdingsColl] = await Promise.all([
    getCollection('expenses', auth),
    getCollection('budgets', auth),
    getCollection('categories', auth),
    getCollection('groups', auth),
    getCollection('subscriptions', auth),
    getCollection('holdings', auth),
  ])

  const [expenseDocs, budgetDocs, categoryDocs, groupDocs, subscriptionDocs, holdingDocs] = await Promise.all([
    // Indexed by { user_id: 1, date: -1 } (scripts/ensure-indexes.mjs).
    expensesColl.find({ date: { $gte: monthOnly ? `${today.slice(0, 7)}-01` : factsWindowStart(today) } }).toArray(),
    budgetsColl.find({}).toArray(),
    categoriesColl.find({}).toArray(),
    groupsColl.find({}).toArray(),
    subscriptionsColl.find({}).toArray(),
    holdingsColl.find({}).toArray(),
  ])

  const expenses: ExpenseRow[] = expenseDocs.map((d) => ({
    timestamp: d.timestamp ? String(d.timestamp) : undefined,
    date: String(d.date ?? ''),
    item: d.item ? String(d.item) : d.description ? String(d.description) : '',
    amount_inr: Number(d.amount_inr ?? d.amount) || 0,
    category: String(d.category ?? ''),
    notes: d.notes ? String(d.notes) : undefined,
    payment_method: d.payment_method ? String(d.payment_method) : undefined,
  }))

  const budgets: BudgetDocRow[] = budgetDocs.map((d) => ({
    month: String(d.month ?? ''),
    category: String(d.category ?? ''),
    assigned: Number(d.assigned) || 0,
    rolled_over: Number(d.rolled_over) || 0,
    extra: Number(d.extra) || 0,
  }))

  const categories: CategoryDocRow[] = categoryDocs
    .map((d) => ({
      name: String(d.name ?? ''),
      group: d.group ? String(d.group) : '',
      alertPcts: Array.isArray(d.alertPcts) ? d.alertPcts.filter((v): v is number => typeof v === 'number') : undefined,
    }))
    .filter((c) => c.name)

  const groups: GroupDocRow[] = groupDocs.map((d) => ({ name: String(d.name ?? '') })).filter((g) => g.name)

  const subscriptions: SubscriptionDocRow[] = subscriptionDocs.map((d) => ({
    service: String(d.service ?? ''),
    amount_inr: Number(d.amount_inr) || 0,
    billing_cycle: d.billing_cycle ? String(d.billing_cycle) : undefined,
    next_due_date: d.next_due_date ? String(d.next_due_date) : undefined,
    renewal_or_end_month: d.renewal_or_end_month ? String(d.renewal_or_end_month) : undefined,
    timestamp: d.timestamp ? String(d.timestamp) : undefined,
    status: d.status ? String(d.status) : undefined,
  }))

  const holdings: HoldingDocRow[] = holdingDocs.map((d) => ({
    name: String(d.name ?? ''),
    type: d.type ? String(d.type) : undefined,
    value: Number(d.value) || 0,
    updated_at: d.updated_at ? String(d.updated_at) : undefined,
  }))

  const currentMonth = today.slice(0, 7)

  const currencyCode = await getUserCurrency(auth.userId)
  const result = summarizeExpenses({ expenses, budgets, categories, groups, subscriptions, holdings, currentMonth, today })
  return { ...result, facts: `${currencyInstruction(currencyCode)}\n${result.facts}`, currencyCode }
}
