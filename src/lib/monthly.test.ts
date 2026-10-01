import { describe, expect, it } from 'vitest'
import { monthRange, categoryBreakdown, withDelta, leftoverFor, monthTotals, monthComparison, fixedCategories, savingsTrend } from './monthly'
import { CREDIT_CARD_CATEGORY, INCOME_CATEGORY, currentMonthKey, prevMonthKey } from './envelope'
import type { BudgetRow, CategoryRow, ExpenseRow } from '@/src/types'

function budget(month: string, category: string, assigned: string): BudgetRow {
  return { month, category, assigned, rolled_over: '0', version: 0 }
}

function expense(date: string, category: string, amount_inr: string): ExpenseRow {
  return {
    timestamp: date,
    date,
    item: 'x',
    amount_inr,
    category,
    notes: '',
    source: '',
    amount: amount_inr,
    description: '',
    payment_method: '',
  }
}

describe('monthRange', () => {
  it('does not drop the last day of a 30-day month', () => {
    expect(monthRange('2026-09')).toEqual({ start: '2026-09-01', end: '2026-09-30' })
  })

  it('does not drop the last day of a 31-day month', () => {
    expect(monthRange('2026-08')).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  })

  it('handles February in a leap year', () => {
    expect(monthRange('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })

  it('handles February in a non-leap year', () => {
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
})

describe('categoryBreakdown', () => {
  const categories: CategoryRow[] = [
    { name: '🍔 Food', group: 'Living' },
    { name: '🏠 Rent', group: 'Living' },
    { name: 'Misc', group: '' },
  ]
  const groups = ['Living']

  it('keeps spend for a category deleted since the month it was spent in', () => {
    const expenses = [expense('2026-08-05', 'Old Category', '500')]
    const rows = categoryBreakdown([], expenses, [], [], '2026-08', 'category')
    expect(rows.find((r) => r.key === 'Old Category')?.spent).toBe(500)
  })

  it('excludes credit card payments and income', () => {
    const expenses = [
      expense('2026-08-05', CREDIT_CARD_CATEGORY, '1000'),
      expense('2026-08-05', INCOME_CATEGORY, '5000'),
      expense('2026-08-05', '🍔 Food', '200'),
    ]
    const rows = categoryBreakdown([], expenses, categories, groups, '2026-08', 'category')
    expect(rows.some((r) => r.key === CREDIT_CARD_CATEGORY)).toBe(false)
    expect(rows.some((r) => r.key === INCOME_CATEGORY)).toBe(false)
    expect(rows.find((r) => r.key === '🍔 Food')?.spent).toBe(200)
  })

  it('splits emoji from the label', () => {
    const expenses = [expense('2026-08-05', '🍔 Food', '200')]
    const rows = categoryBreakdown([], expenses, categories, groups, '2026-08', 'category')
    const row = rows.find((r) => r.label === 'Food')
    expect(row?.emoji).toBe('🍔')
  })

  it('joins assigned amounts from budgets', () => {
    const budgets = [budget('2026-08', '🍔 Food', '1000')]
    const expenses = [expense('2026-08-05', '🍔 Food', '200')]
    const rows = categoryBreakdown(budgets, expenses, categories, groups, '2026-08', 'category')
    expect(rows.find((r) => r.key === '🍔 Food')?.assigned).toBe(1000)
  })

  it('rolls up by group, bucketing ungrouped categories into Other', () => {
    const expenses = [
      expense('2026-08-05', '🍔 Food', '200'),
      expense('2026-08-05', '🏠 Rent', '300'),
      expense('2026-08-05', 'Misc', '50'),
    ]
    const rows = categoryBreakdown([], expenses, categories, groups, '2026-08', 'group')
    expect(rows.find((r) => r.key === 'Living')?.spent).toBe(500)
    expect(rows.find((r) => r.key === 'Other')?.spent).toBe(50)
  })

  it('sorts rows descending by spend', () => {
    const expenses = [
      expense('2026-08-05', '🍔 Food', '100'),
      expense('2026-08-05', '🏠 Rent', '900'),
    ]
    const rows = categoryBreakdown([], expenses, categories, groups, '2026-08', 'category')
    expect(rows[0].key).toBe('🏠 Rent')
  })

  it('only counts expenses within the given month', () => {
    const expenses = [
      expense('2026-07-05', '🍔 Food', '999'),
      expense('2026-08-05', '🍔 Food', '100'),
    ]
    const rows = categoryBreakdown([], expenses, categories, groups, '2026-08', 'category')
    expect(rows.find((r) => r.key === '🍔 Food')?.spent).toBe(100)
  })

  it('flags assignedIsCarried when the month has no budget row of its own', () => {
    const budgets = [budget('2026-07', '🍔 Food', '1000')]
    const expenses = [expense('2026-08-05', '🍔 Food', '200')]
    const rows = categoryBreakdown(budgets, expenses, categories, groups, '2026-08', 'category')
    const row = rows.find((r) => r.key === '🍔 Food')
    expect(row?.assigned).toBe(1000)
    expect(row?.assignedIsCarried).toBe(true)
  })

  it('does not flag assignedIsCarried when the month has its own budget row', () => {
    const budgets = [budget('2026-08', '🍔 Food', '1000')]
    const expenses = [expense('2026-08-05', '🍔 Food', '200')]
    const rows = categoryBreakdown(budgets, expenses, categories, groups, '2026-08', 'category')
    expect(rows.find((r) => r.key === '🍔 Food')?.assignedIsCarried).toBe(false)
  })

  it('does not flag assignedIsCarried for the current month, where a carried amount is the live budget', () => {
    const month = currentMonthKey()
    const budgets = [budget(prevMonthKey(month), '🍔 Food', '1000')]
    const expenses = [expense(`${month}-05`, '🍔 Food', '200')]
    const rows = categoryBreakdown(budgets, expenses, categories, groups, month, 'category')
    const row = rows.find((r) => r.key === '🍔 Food')
    expect(row?.assigned).toBe(1000)
    expect(row?.assignedIsCarried).toBe(false)
  })

  it('falls back to the category emoji table for a name with no leading emoji', () => {
    const expenses = [expense('2026-08-05', 'Cook', '200')]
    const rows = categoryBreakdown([], expenses, [{ name: 'Cook', group: 'Living' }], groups, '2026-08', 'category')
    expect(rows.find((r) => r.key === 'Cook')?.emoji).toBe('👨‍🍳')
  })

  it('splits the emoji off a group label', () => {
    const expenses = [expense('2026-08-05', '🍔 Food', '200')]
    const cats: CategoryRow[] = [{ name: '🍔 Food', group: '🏠 Living' }]
    const rows = categoryBreakdown([], expenses, cats, ['🏠 Living'], '2026-08', 'group')
    const row = rows.find((r) => r.key === '🏠 Living')
    expect(row?.label).toBe('Living')
    expect(row?.emoji).toBe('🏠')
  })
})

describe('monthTotals', () => {
  it('sums spend per month, excluding credit card and income', () => {
    const expenses = [
      expense('2026-07-05', '🍔 Food', '100'),
      expense('2026-08-05', '🍔 Food', '200'),
      expense('2026-08-06', '🏠 Rent', '300'),
      expense('2026-08-07', CREDIT_CARD_CATEGORY, '9999'),
    ]
    const totals = monthTotals(expenses, ['2026-07', '2026-08'])
    expect(totals.get('2026-07')).toBe(100)
    expect(totals.get('2026-08')).toBe(500)
  })

  it('reports 0 for a month with no expenses', () => {
    const totals = monthTotals([], ['2026-06'])
    expect(totals.get('2026-06')).toBe(0)
  })
})

describe('monthComparison', () => {
  function spread(month: string, amount: string): ExpenseRow {
    return expense(`${month}-15`, '🍔 Food', amount)
  }

  it('returns a null baseline with fewer than 2 prior months of data', () => {
    const expenses = [spread('2026-08', '900')]
    const result = monthComparison(expenses, '2026-08', '2026-09-01')
    expect(result.baseline).toBeNull()
    expect(result.deltaPct).toBeNull()
  })

  it('computes deltaPct against the mean of 3 prior months', () => {
    const expenses = [
      spread('2026-05', '1000'),
      spread('2026-06', '1000'),
      spread('2026-07', '1000'),
      spread('2026-08', '1200'),
    ]
    const result = monthComparison(expenses, '2026-08', '2026-09-01')
    expect(result.baseline).toBe(1000)
    expect(result.deltaPct).toBe(20)
  })

  it('is not in progress, and has no projection, for a closed month', () => {
    const expenses = [spread('2026-08', '900')]
    const result = monthComparison(expenses, '2026-08', '2026-09-01')
    expect(result.inProgress).toBe(false)
    expect(result.projected).toBeNull()
  })

  it('truncates both the selected and baseline months at the same day-of-month when in progress', () => {
    const expenses = [
      expense('2026-05-10', '🍔 Food', '100'),
      expense('2026-05-20', '🍔 Food', '900'), // after the cutoff day, must be excluded from baseline
      expense('2026-06-10', '🍔 Food', '100'),
      expense('2026-07-10', '🍔 Food', '100'),
      expense('2026-08-10', '🍔 Food', '150'), // "today" is the 10th
    ]
    const result = monthComparison(expenses, '2026-08', '2026-08-10')
    expect(result.inProgress).toBe(true)
    expect(result.spent).toBe(150)
    expect(result.baseline).toBe(100)
  })

  it('projects the full month from the day-elapsed run rate', () => {
    const expenses = [
      expense('2026-08-01', '🍔 Food', '100'),
      expense('2026-08-10', '🍔 Food', '100'),
    ]
    // 10 days elapsed, 200 spent, 31-day month -> 200/10*31 = 620
    const result = monthComparison(expenses, '2026-08', '2026-08-10')
    expect(result.projected).toBe(620)
  })

  it('reports a driver only when one category explains most of the delta', () => {
    const wide: ExpenseRow[] = [
      expense('2026-05-05', '🍔 Food', '500'),
      expense('2026-05-05', '🏠 Rent', '500'),
      expense('2026-06-05', '🍔 Food', '500'),
      expense('2026-06-05', '🏠 Rent', '500'),
      expense('2026-07-05', '🍔 Food', '500'),
      expense('2026-07-05', '🏠 Rent', '500'),
      // August: Food alone doubles, Rent unchanged
      expense('2026-08-05', '🍔 Food', '1000'),
      expense('2026-08-05', '🏠 Rent', '500'),
    ]
    const result = monthComparison(wide, '2026-08', '2026-09-01')
    expect(result.driver?.category).toBe('Food')
  })

  it('suppresses the driver when the delta is spread across categories', () => {
    const wide: ExpenseRow[] = [
      expense('2026-05-05', '🍔 Food', '500'),
      expense('2026-05-05', '🏠 Rent', '500'),
      expense('2026-05-05', 'Misc', '500'),
      expense('2026-06-05', '🍔 Food', '500'),
      expense('2026-06-05', '🏠 Rent', '500'),
      expense('2026-06-05', 'Misc', '500'),
      expense('2026-07-05', '🍔 Food', '500'),
      expense('2026-07-05', '🏠 Rent', '500'),
      expense('2026-07-05', 'Misc', '500'),
      // August: all three rise by the same amount, no single driver
      expense('2026-08-05', '🍔 Food', '600'),
      expense('2026-08-05', '🏠 Rent', '600'),
      expense('2026-08-05', 'Misc', '600'),
    ]
    const result = monthComparison(wide, '2026-08', '2026-09-01')
    expect(result.driver).toBeNull()
  })

  it('excludes credit card and income from the comparison', () => {
    const expenses = [
      spread('2026-08', '900'),
      expense('2026-08-05', CREDIT_CARD_CATEGORY, '5000'),
      expense('2026-08-05', INCOME_CATEGORY, '20000'),
    ]
    const result = monthComparison(expenses, '2026-08', '2026-09-01')
    expect(result.spent).toBe(900)
  })
})

describe('fixedCategories', () => {
  it('flags a category with near-identical spend across the trailing months', () => {
    const expenses = [
      expense('2026-06-01', '🏠 Rent', '8200'),
      expense('2026-07-01', '🏠 Rent', '8200'),
      expense('2026-08-01', '🏠 Rent', '8200'),
    ]
    expect(fixedCategories(expenses, '2026-08').has('🏠 Rent')).toBe(true)
  })

  it('does not flag a category with volatile spend', () => {
    const expenses = [
      expense('2026-06-01', '🍔 Food', '200'),
      expense('2026-07-01', '🍔 Food', '900'),
      expense('2026-08-01', '🍔 Food', '400'),
    ]
    expect(fixedCategories(expenses, '2026-08').has('🍔 Food')).toBe(false)
  })

  it('does not flag a category missing from some trailing months', () => {
    const expenses = [
      expense('2026-07-01', '🏠 Rent', '8200'),
      expense('2026-08-01', '🏠 Rent', '8200'),
    ]
    expect(fixedCategories(expenses, '2026-08').has('🏠 Rent')).toBe(false)
  })
})

describe('withDelta', () => {
  it('computes deltaPct against the previous month rows', () => {
    const rows = [{ key: 'Food', label: 'Food', emoji: '', spent: 150, assigned: 0, assignedIsCarried: false, pct: 0 }]
    const prevRows = [{ key: 'Food', label: 'Food', emoji: '', spent: 100, assigned: 0, assignedIsCarried: false, pct: 0 }]
    const result = withDelta(rows, prevRows)
    expect(result[0].deltaPct).toBe(50)
  })

  it('returns null delta when the previous month had zero spend', () => {
    const rows = [{ key: 'Food', label: 'Food', emoji: '', spent: 150, assigned: 0, assignedIsCarried: false, pct: 0 }]
    const prevRows: typeof rows = []
    const result = withDelta(rows, prevRows)
    expect(result[0].deltaPct).toBeNull()
  })
})

describe('leftoverFor', () => {
  it('matches income minus total spend for the given month', () => {
    const budgets = [budget('2026-07', INCOME_CATEGORY, '10000'), budget('2026-07', '🍔 Food', '1000')]
    const expenses = [expense('2026-07-05', '🍔 Food', '600')]
    const categories: CategoryRow[] = [{ name: '🍔 Food', group: 'Living' }]
    const groups = ['Living']
    expect(leftoverFor(budgets, expenses, categories, groups, '2026-07')).toBe(10000 - 600)
  })
})

describe('savingsTrend', () => {
  const categories: CategoryRow[] = [{ name: '🍔 Food', group: 'Living' }]
  const groups = ['Living']

  it('saves income minus spending each month, carrying income forward and counting a top-up', () => {
    // 1 lakh set in July carries into August; September gets a 10k top-up.
    const budgets = [budget('2026-07', INCOME_CATEGORY, '100000'), budget('2026-09', INCOME_CATEGORY, '110000')]
    const expenses = [
      expense('2026-07-05', '🍔 Food', '60000'),
      expense('2026-08-05', '🍔 Food', '70000'),
      expense('2026-09-05', '🍔 Food', '50000'),
    ]
    const { points } = savingsTrend(budgets, expenses, categories, groups, '2026-09')
    expect(points).toEqual([
      { date: '2026-07', value: 40000 },
      { date: '2026-08', value: 30000 },
      { date: '2026-09', value: 60000 },
    ])
  })

  it('keeps a month that spent more than it earned negative', () => {
    const budgets = [budget('2026-08', INCOME_CATEGORY, '50000')]
    const expenses = [expense('2026-08-05', '🍔 Food', '65000')]
    expect(savingsTrend(budgets, expenses, categories, groups, '2026-09').points[0]).toEqual({ date: '2026-08', value: -15000 })
  })

  it('starts at the first month with income, not the first expense', () => {
    // Expenses logged in June before any income was set had nothing to save from.
    const budgets = [budget('2026-08', INCOME_CATEGORY, '50000')]
    const expenses = [expense('2026-06-05', '🍔 Food', '9000'), expense('2026-08-05', '🍔 Food', '10000')]
    const result = savingsTrend(budgets, expenses, categories, groups, '2026-09')
    expect(result.points.map((p) => p.date)).toEqual(['2026-08', '2026-09'])
    expect(result.since).toBe('2026-08')
  })

  it('totals finished months only, since the current month is still moving', () => {
    const budgets = [budget('2026-07', INCOME_CATEGORY, '100000')]
    const expenses = [
      expense('2026-07-05', '🍔 Food', '60000'),
      expense('2026-08-05', '🍔 Food', '110000'),
      expense('2026-09-05', '🍔 Food', '1000'),
    ]
    // July +40000, August -10000; September's 99000 so far is left out.
    expect(savingsTrend(budgets, expenses, categories, groups, '2026-09').total).toBe(30000)
  })

  it('does not count a credit card payment as spending twice', () => {
    const budgets = [budget('2026-08', INCOME_CATEGORY, '50000')]
    const expenses = [expense('2026-08-05', '🍔 Food', '10000'), expense('2026-08-20', CREDIT_CARD_CATEGORY, '10000')]
    expect(savingsTrend(budgets, expenses, categories, groups, '2026-09').points[0].value).toBe(40000)
  })

  it('is empty until an income is set', () => {
    const result = savingsTrend([], [expense('2026-08-05', '🍔 Food', '10000')], categories, groups, '2026-09')
    expect(result).toEqual({ points: [], total: 0, since: null, missingIncome: ['2026-08'] })
  })

  it('lists months with spending but no income, so the user can backfill them', () => {
    // Past expenses logged for June and August, income only set from September.
    const budgets = [budget('2026-09', INCOME_CATEGORY, '100000')]
    const expenses = [
      expense('2026-06-05', '🍔 Food', '9000'),
      expense('2026-08-05', '🍔 Food', '8000'),
      expense('2026-09-05', '🍔 Food', '7000'),
    ]
    expect(savingsTrend(budgets, expenses, categories, groups, '2026-09').missingIncome).toEqual(['2026-06', '2026-08'])
  })

  it('ignores income-only and credit card payment rows when looking for spending', () => {
    const budgets = [budget('2026-09', INCOME_CATEGORY, '100000')]
    const expenses = [expense('2026-07-05', CREDIT_CARD_CATEGORY, '5000'), expense('2026-07-01', INCOME_CATEGORY, '90000')]
    expect(savingsTrend(budgets, expenses, categories, groups, '2026-09').missingIncome).toEqual([])
  })
})
