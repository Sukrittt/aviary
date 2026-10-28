// Per-month category analytics for Insights. Kept separate from envelope.ts
// (the current-envelope math) since this is read-only history over an
// arbitrary past month, not the live assign/spend engine.
import {
  computeEnvelopeState,
  currentMonthKey,
  shiftMonthKey,
  CREDIT_CARD_CATEGORY,
  INCOME_CATEGORY,
} from './envelope'
import { splitEmoji } from './emoji'
import { categoryIconKey, groupIconKey, DEFAULT_GROUP_ICON, type CategoryIconKey } from './categoryIcons'
import type { BudgetRow, CategoryRow, ExpenseRow } from '@/src/types'

/** "2026-09" -> { start: "2026-09-01", end: "2026-09-30" }. String-built, no
 *  Date/toISOString round-trip, so it can't roll back a day in a UTC+ zone. */
export function monthRange(key: string): { start: string; end: string } {
  const [y, m] = key.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { start: `${key}-01`, end: `${key}-${String(lastDay).padStart(2, '0')}` }
}

export interface BreakdownRow {
  key: string
  label: string
  /** Render with `CATEGORY_ICON_COMPONENTS[icon]`; null for a group with no icon of its own. */
  icon: CategoryIconKey | null
  spent: number
  assigned: number
  /** True when `assigned` was carried forward from a prior month's budget row
   *  rather than set for this month (see carriedAssigned() in envelope.ts). A
   *  past month with no row of its own never had this budget; say so instead
   *  of presenting the carried figure as a fact for that month.
   *
   *  Only ever true for a past month. For the current one, the carried amount
   *  is the live budget: Home shows it as the envelope's assigned figure
   *  (₹4,000/₹4,000), so calling the same number "no budget set" here would
   *  contradict the other half of the app on the same day. */
  assignedIsCarried: boolean
  pct: number
  deltaPct?: number | null
}

function isExcluded(category: string): boolean {
  return category === CREDIT_CARD_CATEGORY || category === INCOME_CATEGORY
}

/** Total spend for `month`, per category, excluding CC/income. Optionally
 *  truncated to the first `cutoffDay` days, for comparing an in-progress
 *  month against prior months on equal footing. */
function categorySpendInMonth(
  expenseRows: ExpenseRow[],
  month: string,
  cutoffDay: number | null,
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const e of expenseRows) {
    if (!e.date.startsWith(month)) continue
    if (isExcluded(e.category)) continue
    if (cutoffDay != null && Number(e.date.slice(8, 10)) > cutoffDay) continue
    totals.set(e.category, (totals.get(e.category) ?? 0) + (Number(e.amount_inr) || 0))
  }
  return totals
}

function totalSpendInMonth(expenseRows: ExpenseRow[], month: string, cutoffDay: number | null): number {
  let sum = 0
  for (const v of categorySpendInMonth(expenseRows, month, cutoffDay).values()) sum += v
  return sum
}

/** Per-category or per-group spend for `month`, joined with that month's assigned amounts.
 *  Spend is aggregated directly off `expenses` (not off computeEnvelopeState's envelope
 *  list) so a category deleted since the month it was spent in still shows its spend. */
export function categoryBreakdown(
  budgetRows: BudgetRow[],
  expenseRows: ExpenseRow[],
  categoryRows: CategoryRow[],
  groupNames: string[],
  month: string,
  mode: 'category' | 'group',
): BreakdownRow[] {
  const spentByCategory = new Map<string, number>()
  for (const e of expenseRows) {
    if (!e.date.startsWith(month)) continue
    if (isExcluded(e.category)) continue
    spentByCategory.set(e.category, (spentByCategory.get(e.category) ?? 0) + (Number(e.amount_inr) || 0))
  }

  const envelopeState = computeEnvelopeState(budgetRows, expenseRows, month, categoryRows, groupNames)
  const assignedByCategory = new Map<string, number>()
  for (const env of envelopeState.envelopes) {
    if (isExcluded(env.category)) continue
    assignedByCategory.set(env.category, env.assigned)
  }

  const hasOwnBudgetRow = new Set(
    budgetRows.filter((b) => b.month === month).map((b) => b.category),
  )
  const isPast = month < currentMonthKey()
  const isCarried = (category: string) => isPast && !hasOwnBudgetRow.has(category)

  const groupByCategory = new Map<string, string>()
  const iconByCategory = new Map<string, string | undefined>()
  for (const c of categoryRows) {
    groupByCategory.set(c.name, c.group ?? '')
    iconByCategory.set(c.name, c.icon)
  }

  const total = [...spentByCategory.values()].reduce((s, v) => s + v, 0) || 1

  if (mode === 'category') {
    const rows: BreakdownRow[] = [...spentByCategory.keys()].map((category) => {
      const { text } = splitEmoji(category)
      const spent = spentByCategory.get(category) ?? 0
      return {
        key: category,
        label: text,
        icon: categoryIconKey(category, iconByCategory.get(category), groupByCategory.get(category)),
        spent,
        assigned: assignedByCategory.get(category) ?? 0,
        assignedIsCarried: isCarried(category),
        pct: (spent / total) * 100,
      }
    })
    return rows.sort((a, b) => b.spent - a.spent)
  }

  const spentByGroup = new Map<string, number>()
  const assignedByGroup = new Map<string, number>()
  const carriedByGroup = new Map<string, boolean>()
  for (const [category, spent] of spentByCategory) {
    const group = groupByCategory.get(category) || 'Other'
    spentByGroup.set(group, (spentByGroup.get(group) ?? 0) + spent)
    assignedByGroup.set(group, (assignedByGroup.get(group) ?? 0) + (assignedByCategory.get(category) ?? 0))
    carriedByGroup.set(group, (carriedByGroup.get(group) ?? true) && isCarried(category))
  }
  const rows: BreakdownRow[] = [...spentByGroup.keys()].map((group) => {
    const spent = spentByGroup.get(group) ?? 0
    // No default-folder fallback: an unknown group would get the same generic
    // glyph as every other one, which reads as noise next to the colour dot
    // it replaces.
    const icon = groupIconKey(group)
    return {
      key: group,
      label: splitEmoji(group).text,
      icon: icon === DEFAULT_GROUP_ICON ? null : icon,
      spent,
      assigned: assignedByGroup.get(group) ?? 0,
      assignedIsCarried: carriedByGroup.get(group) ?? true,
      pct: (spent / total) * 100,
    }
  })
  return rows.sort((a, b) => b.spent - a.spent)
}

/** Attaches deltaPct vs the matching row (by key) in `prevRows`. null when the
 *  previous month had no spend in that category — no meaningful percentage
 *  off a zero base. */
export function withDelta(rows: BreakdownRow[], prevRows: BreakdownRow[]): BreakdownRow[] {
  const prevByKey = new Map(prevRows.map((r) => [r.key, r.spent]))
  return rows.map((row) => {
    const prevSpent = prevByKey.get(row.key)
    const deltaPct = prevSpent ? ((row.spent - prevSpent) / prevSpent) * 100 : null
    return { ...row, deltaPct }
  })
}

/** income - totalSpent for an arbitrary month. Generalizes Home's
 *  prevMonthLeftover (app/(tabs)/index.tsx) to any month key. */
export function leftoverFor(
  budgetRows: BudgetRow[],
  expenseRows: ExpenseRow[],
  categoryRows: CategoryRow[],
  groupNames: string[],
  month: string,
): number {
  const state = computeEnvelopeState(budgetRows, expenseRows, month, categoryRows, groupNames)
  return state.income - state.totalSpent
}

export interface SavingsTrend {
  /** Income minus spending, one point per month from `since` to the current month. */
  points: { date: string; value: number }[]
  /** Sum over finished months; the current month's figure still moves. */
  total: number
  /** First month with income on record, or null before any is set. */
  since: string | null
  /** Months with spending but no income on record (before `since`), oldest
   *  first. Not guessed from later income: the user backfills them instead. */
  missingIncome: string[]
}

/** What each month actually kept: its income (carried forward, top-ups
 *  included) minus its spending. Unspent money also rolls forward inside its
 *  envelope (lib/budgetCarry.ts), but this stays a per-month view of what each
 *  month itself saved. Starts at the first month with income,
 *  since spending logged before that had nothing to save from. */
export function savingsTrend(
  budgetRows: BudgetRow[],
  expenseRows: ExpenseRow[],
  categoryRows: CategoryRow[],
  groupNames: string[],
  currentMonth: string,
): SavingsTrend {
  const since = budgetRows
    .filter((b) => b.category === INCOME_CATEGORY && Number(b.assigned) + (Number(b.extra) || 0) > 0 && b.month <= currentMonth)
    .reduce<string | null>((first, b) => (first == null || b.month < first ? b.month : first), null)
  const missingIncome = [
    ...new Set(
      expenseRows
        .filter((e) => !isExcluded(e.category) && (Number(e.amount_inr) || 0) > 0)
        .map((e) => e.date.slice(0, 7))
        .filter((month) => month <= currentMonth && (since == null || month < since)),
    ),
  ].sort()
  if (since == null) return { points: [], total: 0, since: null, missingIncome }

  const points: SavingsTrend['points'] = []
  for (let month = since; month <= currentMonth; month = shiftMonthKey(month, 1)) {
    points.push({ date: month, value: leftoverFor(budgetRows, expenseRows, categoryRows, groupNames, month) })
  }
  const total = points.filter((p) => p.date < currentMonth).reduce((sum, p) => sum + p.value, 0)
  return { points, total, since, missingIncome }
}

/** Total spend per month key (CC/income excluded), for the trend chart and
 *  monthComparison's baseline — the one place both read from, so they can't
 *  disagree on what a month's total was. */
export function monthTotals(expenseRows: ExpenseRow[], months: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const m of months) map.set(m, totalSpendInMonth(expenseRows, m, null))
  return map
}

export interface MonthComparison {
  spent: number
  /** Mean of the trailing 3 months that have any recorded data. Null when
   *  fewer than 2 qualify — comparing against a month that never happened
   *  would be worse than no comparison. */
  baseline: number | null
  deltaPct: number | null
  inProgress: boolean
  /** Run-rate projection to month end. Only set when `inProgress`. */
  projected: number | null
  /** The category responsible for most of the move away from baseline, only
   *  when it accounts for at least 40% of the total delta — otherwise the
   *  move is spread across categories and naming one would be misleading. */
  driver: { category: string; delta: number } | null
  /** Days elapsed if `inProgress`, else the month's full day count — for a
   *  daily-pace line when there's no baseline yet to compare against. */
  days: number
}

const DRIVER_SHARE_THRESHOLD = 0.4

/** Up to 3 months before `month` that have any expense: the baseline months
 *  for monthComparison and spikeFor. A month that never happened isn't a zero. */
function priorMonthsWithData(expenseRows: ExpenseRow[], month: string): string[] {
  return [1, 2, 3]
    .map((n) => shiftMonthKey(month, -n))
    .filter((m) => expenseRows.some((e) => e.date.startsWith(m)))
}

/** "Is this a normal month?" — the screen's headline. Compares `month` against
 *  the mean of its 3 preceding months, day-truncated to `today`'s day-of-month
 *  when `month` is still in progress so a 10-day-old month isn't compared
 *  against full prior months. */
export function monthComparison(expenseRows: ExpenseRow[], month: string, today: string): MonthComparison {
  const inProgress = today.startsWith(month)
  const cutoffDay = inProgress ? Number(today.slice(8, 10)) : null

  const spent = totalSpendInMonth(expenseRows, month, cutoffDay)

  const priorMonths = priorMonthsWithData(expenseRows, month)

  const baseline =
    priorMonths.length >= 2
      ? priorMonths.reduce((s, m) => s + totalSpendInMonth(expenseRows, m, cutoffDay), 0) / priorMonths.length
      : null

  const deltaPct = baseline != null && baseline > 0 ? ((spent - baseline) / baseline) * 100 : null

  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const days = inProgress && cutoffDay ? cutoffDay : daysInMonth

  let projected: number | null = null
  if (inProgress && cutoffDay) {
    projected = (spent / cutoffDay) * daysInMonth
  }

  let driver: MonthComparison['driver'] = null
  const totalDelta = baseline != null ? spent - baseline : 0
  if (baseline != null && totalDelta !== 0) {
    const currByCategory = categorySpendInMonth(expenseRows, month, cutoffDay)
    const baselineByCategory = new Map<string, number>()
    for (const m of priorMonths) {
      for (const [category, amount] of categorySpendInMonth(expenseRows, m, cutoffDay)) {
        baselineByCategory.set(category, (baselineByCategory.get(category) ?? 0) + amount)
      }
    }
    let best: { category: string; delta: number } | null = null
    for (const category of new Set([...currByCategory.keys(), ...baselineByCategory.keys()])) {
      const curr = currByCategory.get(category) ?? 0
      const avg = (baselineByCategory.get(category) ?? 0) / priorMonths.length
      const delta = curr - avg
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { category, delta }
    }
    if (best && Math.abs(best.delta) / Math.abs(totalDelta) >= DRIVER_SHARE_THRESHOLD) {
      driver = { category: splitEmoji(best.category).text, delta: best.delta }
    }
  }

  return { spent, baseline, deltaPct, inProgress, projected, driver, days }
}

const FIXED_CV_THRESHOLD = 0.1

/** Categories whose spend has stayed within ~10% of its own mean across the
 *  trailing `lookback` months (Rent: 8200/8200/8200) — as close to "fixed
 *  cost" as can be derived without a schema change, since CategoryRow carries
 *  no such flag. Requires spend in every one of those months; a category with
 *  a gap hasn't proven it recurs. */
export function fixedCategories(expenseRows: ExpenseRow[], month: string, lookback = 3): Set<string> {
  const months = Array.from({ length: lookback }, (_, i) => shiftMonthKey(month, -i))
  const amountsByCategory = new Map<string, number[]>()
  for (const m of months) {
    const monthTotals_ = categorySpendInMonth(expenseRows, m, null)
    for (const [category, amount] of monthTotals_) {
      const arr = amountsByCategory.get(category) ?? []
      arr.push(amount)
      amountsByCategory.set(category, arr)
    }
  }
  const fixed = new Set<string>()
  for (const [category, amounts] of amountsByCategory) {
    if (amounts.length < lookback) continue
    const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length
    if (mean <= 0) continue
    const variance = amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length
    const cv = Math.sqrt(variance) / mean
    if (cv < FIXED_CV_THRESHOLD) fixed.add(category)
  }
  return fixed
}

export interface CategorySpike {
  category: string
  label: string
  /** This month, up to today's day of month while it's in progress. */
  spent: number
  /** Mean of the baseline months over the same days. */
  baseline: number
  delta: number
  deltaPct: number
  count: number
  baselineCount: number
  /** What drove the rise: more spends, bigger spends, both, or one big spend. */
  cause: 'more-often' | 'bigger' | 'both' | 'one-off'
  /** This month's 3 biggest spends in the category. */
  top: { item: string; amount: number; date: string }[]
  /** Items this month that the baseline months never had in this category, biggest first, up to 3. */
  newItems: string[]
}

const SPIKE_MIN_PCT = 25
/** Of the usual whole month, so a ₹40 to ₹90 jump doesn't flag on a ₹30k budget. */
const SPIKE_MIN_SHARE = 0.02
/** Before this day an in-progress month is mostly noise. */
const SPIKE_MIN_DAY = 7
const CAUSE_RATIO = 1.2

const itemKey = (item: string) => item.trim().toLowerCase()

/** Whether `category` is clearly above its usual level in `month`, and why.
 *  Same baseline rules as monthComparison: the mean of up to 3 prior months
 *  with data (2+ needed), day-truncated while `month` is in progress. Null
 *  when it isn't rising, or the category has no history to rise from. */
export function spikeFor(expenseRows: ExpenseRow[], category: string, month: string, today: string): CategorySpike | null {
  if (isExcluded(category)) return null
  const inProgress = today.startsWith(month)
  const cutoffDay = inProgress ? Number(today.slice(8, 10)) : null
  if (cutoffDay != null && cutoffDay < SPIKE_MIN_DAY) return null
  const priorMonths = priorMonthsWithData(expenseRows, month)
  if (priorMonths.length < 2) return null

  const inWindow = (e: ExpenseRow, m: string) =>
    e.date.startsWith(m) && (cutoffDay == null || Number(e.date.slice(8, 10)) <= cutoffDay)
  const amountOf = (e: ExpenseRow) => Number(e.amount_inr) || 0
  const current = expenseRows.filter((e) => e.category === category && inWindow(e, month))
  const prior = expenseRows.filter((e) => e.category === category && priorMonths.some((m) => inWindow(e, m)))

  const spent = current.reduce((s, e) => s + amountOf(e), 0)
  const baseline = prior.reduce((s, e) => s + amountOf(e), 0) / priorMonths.length
  if (baseline <= 0) return null
  const delta = spent - baseline
  const deltaPct = (delta / baseline) * 100
  const usualMonth = priorMonths.reduce((s, m) => s + totalSpendInMonth(expenseRows, m, cutoffDay), 0) / priorMonths.length
  if (deltaPct < SPIKE_MIN_PCT || delta < usualMonth * SPIKE_MIN_SHARE) return null

  const count = current.length
  const baselineCount = prior.length / priorMonths.length
  const avgSpend = count ? spent / count : 0
  const baselineAvgSpend = baseline / baselineCount
  const top = [...current]
    .sort((a, b) => amountOf(b) - amountOf(a))
    .slice(0, 3)
    .map((e) => ({ item: e.item.trim() || splitEmoji(category).text, amount: amountOf(e), date: e.date }))

  const moreOften = count / baselineCount >= CAUSE_RATIO
  const bigger = avgSpend / baselineAvgSpend >= CAUSE_RATIO
  const oneOff = top[0].amount >= 2 * baselineAvgSpend && top[0].amount >= 0.5 * delta
  const cause = oneOff ? 'one-off' : moreOften && !bigger ? 'more-often' : bigger && !moreOften ? 'bigger' : 'both'

  const seen = new Set(prior.map((e) => itemKey(e.item)))
  const fresh = new Map<string, { item: string; amount: number }>()
  for (const e of current) {
    const key = itemKey(e.item)
    if (!key || seen.has(key)) continue
    const entry = fresh.get(key) ?? { item: e.item.trim(), amount: 0 }
    entry.amount += amountOf(e)
    fresh.set(key, entry)
  }
  const newItems = [...fresh.values()].sort((a, b) => b.amount - a.amount).slice(0, 3).map((e) => e.item)

  return { category, label: splitEmoji(category).text, spent, baseline, delta, deltaPct, count, baselineCount, cause, top, newItems }
}

/** The categories most clearly above their usual level in `month`, biggest rise first. */
export function risingCategories(expenseRows: ExpenseRow[], month: string, today: string, limit = 3): CategorySpike[] {
  const categories = new Set(expenseRows.filter((e) => e.date.startsWith(month)).map((e) => e.category))
  return [...categories]
    .map((category) => spikeFor(expenseRows, category, month, today))
    .filter((spike): spike is CategorySpike => spike != null)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit)
}

/** The plain "why" under a rising category, from the computed facts alone.
 *  Also the AI explanation's input, so both say the same thing. */
export function spikeSummary(spike: CategorySpike, money: (amount: number) => string): string {
  const usualCount = Math.round(spike.baselineCount)
  const avg = money(spike.count ? spike.spent / spike.count : 0)
  const usualAvg = money(spike.baseline / spike.baselineCount)
  const why = {
    'one-off': `One big spend did most of it: ${spike.top[0]?.item}, ${money(spike.top[0]?.amount ?? 0)}.`,
    'more-often': `You spent here ${spike.count} times, up from about ${usualCount}, and each spend was about the usual size.`,
    bigger: `About as many spends as usual, but bigger: ${avg} each on average, up from ${usualAvg}.`,
    both: `More spends (${spike.count}, up from about ${usualCount}) and bigger ones (${avg} on average, up from ${usualAvg}).`,
  }[spike.cause]
  // A one-off spend already named above isn't news twice.
  const fresh = spike.newItems.filter((item) => spike.cause !== 'one-off' || item !== spike.top[0]?.item)
  return fresh.length ? `${why} New this month: ${fresh.join(', ')}.` : why
}
