import { formatMoney } from '@/src/lib/currencies'
import { parseLocalDate, toLocalDateString } from '@/src/lib/date'
export interface ExpenseRowDetail {
  timestamp: string
  date: string
  item: string
  amountInr: number
  category: string
}

import type { EnvelopeState } from '../types/expense'

export interface ExpensePanelContract {
  meta: {
    generatedAt: string
    month: string
    monthlySpendCapInr: number
    dailySoftCapInr: number
  }
  totals: {
    monthSpendInr: number
    essentialSpendInr: number
    discretionarySpendInr: number
    duesReceivableInr: number
  }
  topCategories: Array<{ category: string; amountInr: number }>
  dailySpend: Array<{ date: string; amountInr: number }>
  expenseRows: ExpenseRowDetail[]
  envelopeState: EnvelopeState | null
  alerts: string[]
  deepLinks: Array<{ label: string; url: string }>
  subscriptions?: Array<{
    timestamp: string
    service: string
    amountInr: number
    billingCycle: string
    nextDueDate: string
    status: string
    renewalOrEndMonth?: string
    notes: string
    category: string
  }>
}

export interface ExpensePanelData {
  lastUpdated: string
  month: string
  spendVsCapPct: number
  runRateStatus: 'ontrack' | 'watch' | 'overshoot'
  monthSpendInr: number
  monthlySpendCapInr: number
  dailySoftCapInr: number
  avgDailyLast7Inr: number
  avgDailyPrev7Inr: number
  trendPct: number
  topCategories: Array<{ category: string; amountInr: number; sharePct: number }>
  duesReceivableInr: number
  essentialSpendInr: number
  discretionarySpendInr: number
  essentialSharePct: number
  discretionarySharePct: number
  alerts: string[]
  deepLinks: Array<{ label: string; url: string }>
  miniTrend: Array<{ date: string; value: number }>
  weeklyAnomalies: Array<{ label: string; totalInr: number; key: string }>
  expenseRows: ExpenseRowDetail[]
  envelopeState: EnvelopeState | null
  weeklyInsights: {
    wentWrong: string
    nextWeek: string
  }
  subscriptions: {
    active: Array<{ timestamp: string; service: string; amountInr: number; billingCycle: string; nextDueDate: string; status: string; renewalOrEndMonth?: string; notes: string; category: string }>
    cancelled: Array<{ timestamp: string; service: string; amountInr: number; billingCycle: string; nextDueDate: string; status: string; renewalOrEndMonth?: string; notes: string; category: string }>
  }
}

function round(value: number, digits = 1): number {
  const base = 10 ** digits
  return Math.round(value * base) / base
}

function weekLabel(dateObj: Date): string {
  const start = new Date(dateObj)
  const day = start.getDay()
  const diffToMonday = (day + 6) % 7
  start.setDate(start.getDate() - diffToMonday)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + 6)

  const format = (date: Date) =>
    date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    })

  return `${format(start)}-${format(end)}`
}

function toWeeklyAnomalies(rows: Array<{ date: string; amountInr: number }>) {
  const weeklyTotals = new Map<string, { label: string; totalInr: number; key: string }>()

  rows.forEach((row) => {
    const date = parseLocalDate(row.date)
    if (Number.isNaN(date.getTime())) return

    const start = new Date(date)
    const day = start.getDay()
    const diffToMonday = (day + 6) % 7
    start.setDate(start.getDate() - diffToMonday)
    start.setHours(0, 0, 0, 0)

    const key = toLocalDateString(start)
    const existing = weeklyTotals.get(key)

    if (existing) {
      existing.totalInr += row.amountInr
      return
    }

    weeklyTotals.set(key, {
      key,
      label: weekLabel(start),
      totalInr: row.amountInr,
    })
  })

  return [...weeklyTotals.values()].sort((a, b) => b.totalInr - a.totalInr)
}

function buildWeeklyInsights(input: ExpensePanelContract, avgDailyLast7Inr: number, trendPct: number, currencyCode = 'INR'): ExpensePanelData['weeklyInsights'] {
  const topCategory = input.topCategories[0]
  const softCapVariancePct = input.meta.dailySoftCapInr
    ? ((avgDailyLast7Inr - input.meta.dailySoftCapInr) / input.meta.dailySoftCapInr) * 100
    : 0

  const wentWrongBits = [
    topCategory
      ? `${topCategory.category} is still the biggest drag at ${formatMoney(Math.round(topCategory.amountInr), currencyCode)}.`
      : 'No clear top category pressure yet.',
    `7d average is ${formatMoney(Math.round(avgDailyLast7Inr), currencyCode)}/day (${trendPct > 0 ? '+' : ''}${round(trendPct)}% vs previous week).`,
  ]

  if (softCapVariancePct > 0) {
    wentWrongBits.push(`Daily run rate is ${round(softCapVariancePct)}% above soft cap.`)
  }

  const nextWeekBits = [
    topCategory ? `Set a hard pre-approval cap on ${topCategory.category} for this week.` : 'Keep spend logging consistent daily.',
    'Freeze non-essential spends for 48h when any day crosses soft cap.',
    'Use dues recovery to offset upcoming discretionary payouts.',
  ]

  return {
    wentWrong: wentWrongBits.join(' '),
    nextWeek: nextWeekBits.join(' '),
  }
}

export function toExpensePanelData(input: ExpensePanelContract, currencyCode = 'INR'): ExpensePanelData {
  const spendVsCapPct = (input.totals.monthSpendInr / input.meta.monthlySpendCapInr) * 100
  const recent = input.dailySpend.slice(-14)
  const prev = recent.slice(0, Math.max(0, recent.length - 7))
  const last = recent.slice(-7)

  const avgDailyPrev7Inr = prev.length ? prev.reduce((sum, row) => sum + row.amountInr, 0) / prev.length : 0
  const avgDailyLast7Inr = last.length ? last.reduce((sum, row) => sum + row.amountInr, 0) / last.length : 0
  const trendPct = avgDailyPrev7Inr > 0 ? ((avgDailyLast7Inr - avgDailyPrev7Inr) / avgDailyPrev7Inr) * 100 : 0

  const runRateStatus: ExpensePanelData['runRateStatus'] =
    spendVsCapPct > 100 ? 'overshoot' : spendVsCapPct > 85 ? 'watch' : 'ontrack'

  const essentialSharePct = input.totals.monthSpendInr
    ? (input.totals.essentialSpendInr / input.totals.monthSpendInr) * 100
    : 0
  const discretionarySharePct = input.totals.monthSpendInr
    ? (input.totals.discretionarySpendInr / input.totals.monthSpendInr) * 100
    : 0

  const subscriptions = input.subscriptions ?? []
  const activeSubscriptions = subscriptions.filter((item) => /^active/i.test(item.status))
  const cancelledSubscriptions = subscriptions.filter((item) => /cancel/i.test(item.status))

  return {
    lastUpdated: input.meta.generatedAt,
    month: input.meta.month,
    envelopeState: input.envelopeState,
    spendVsCapPct: round(spendVsCapPct),
    runRateStatus,
    monthSpendInr: input.totals.monthSpendInr,
    monthlySpendCapInr: input.meta.monthlySpendCapInr,
    dailySoftCapInr: input.meta.dailySoftCapInr,
    avgDailyLast7Inr: round(avgDailyLast7Inr, 0),
    avgDailyPrev7Inr: round(avgDailyPrev7Inr, 0),
    trendPct: round(trendPct),
    topCategories: input.topCategories.map((row) => ({
      ...row,
      sharePct: round((row.amountInr / input.totals.monthSpendInr) * 100),
    })),
    duesReceivableInr: input.totals.duesReceivableInr,
    essentialSpendInr: input.totals.essentialSpendInr,
    discretionarySpendInr: input.totals.discretionarySpendInr,
    essentialSharePct: round(essentialSharePct),
    discretionarySharePct: round(discretionarySharePct),
    alerts: input.alerts,
    deepLinks: input.deepLinks,
    miniTrend: input.dailySpend.map((row) => ({ date: row.date, value: row.amountInr })),
    expenseRows: input.expenseRows,
    weeklyAnomalies: toWeeklyAnomalies(input.dailySpend).slice(0, 8),
    weeklyInsights: buildWeeklyInsights(input, avgDailyLast7Inr, trendPct, currencyCode),
    subscriptions: {
      active: activeSubscriptions,
      cancelled: cancelledSubscriptions,
    },
  }
}
