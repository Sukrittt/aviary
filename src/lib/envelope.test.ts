import { describe, expect, it } from 'vitest'
import { computeEnvelopeState, currentMonthKey, prevMonthKey, extraForReadyToAssign, CREDIT_CARD_CATEGORY, INCOME_CATEGORY } from './envelope'
import type { BudgetRow, CategoryRow, ExpenseRow } from '@/src/types'

function budget(month: string, category: string, assigned: string, rolled_over = '0'): BudgetRow {
  return { month, category, assigned, rolled_over, version: 0 }
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

describe('currentMonthKey / prevMonthKey', () => {
  it('formats a date as YYYY-MM', () => {
    expect(currentMonthKey(new Date(2026, 7, 25))).toBe('2026-08')
  })

  it('uses the IST calendar date, not device-local time, across a month boundary', () => {
    // 2026-08-31T20:00:00Z is already 2026-09-01 in IST (+5:30) — a device
    // local to UTC (or anything west of IST) must still report September.
    expect(currentMonthKey(new Date('2026-08-31T20:00:00Z'))).toBe('2026-09')
  })

  it('rolls back across a year boundary', () => {
    expect(prevMonthKey('2026-01')).toBe('2025-12')
  })

  it('rolls back within the same year', () => {
    expect(prevMonthKey('2026-08')).toBe('2026-07')
  })
})

describe('computeEnvelopeState', () => {
  const categories: CategoryRow[] = [{ name: 'Rent', group: 'Home' }]

  it('does not carry unspent money into the next month', () => {
    const budgets = [budget('2026-07', 'Rent', '1000'), budget('2026-08', 'Rent', '1000')]
    const expenses = [expense('2026-07-05', 'Rent', '400')]
    const state = computeEnvelopeState(budgets, expenses, '2026-08', categories, ['Home'])
    const rent = state.envelopes.find((e) => e.category === 'Rent')!
    expect(rent.rolledOver).toBe(0)
    expect(rent.available).toBe(1000)
  })

  it('carries forward the last month with an income row when the current month has none', () => {
    const budgets = [budget('2026-07', '__income__', '5000'), budget('2026-08', 'Rent', '1000')]
    const state = computeEnvelopeState(budgets, [], '2026-08', categories, ['Home'])
    expect(state.income).toBe(5000)
  })

  it('carries a category\'s last assigned amount into a month with no row of its own', () => {
    const budgets = [budget('2026-07', 'Rent', '9000')]
    const state = computeEnvelopeState(budgets, [], '2026-08', categories, ['Home'])
    const rent = state.envelopes.find((e) => e.category === 'Rent')!
    expect(rent.assigned).toBe(9000)
    expect(rent.available).toBe(9000)
  })

  it('an explicit row for this month, even assigned 0, overrides the carried amount', () => {
    const budgets = [budget('2026-07', 'Rent', '9000'), budget('2026-08', 'Rent', '0')]
    const state = computeEnvelopeState(budgets, [], '2026-08', categories, ['Home'])
    const rent = state.envelopes.find((e) => e.category === 'Rent')!
    expect(rent.assigned).toBe(0)
  })

  it('computes readyToAssign and isOverAssigned', () => {
    const budgets = [
      budget('2026-08', '__income__', '5000'),
      budget('2026-08', 'Rent', '4000'),
    ]
    const state = computeEnvelopeState(budgets, [], '2026-08', categories, ['Home'])
    expect(state.readyToAssign).toBe(1000)
    expect(state.isOverAssigned).toBe(false)

    const overBudgets = [
      budget('2026-08', '__income__', '3000'),
      budget('2026-08', 'Rent', '4000'),
    ]
    const overState = computeEnvelopeState(overBudgets, [], '2026-08', categories, ['Home'])
    expect(overState.readyToAssign).toBe(-1000)
    expect(overState.isOverAssigned).toBe(true)
  })

  it('keeps readyToAssign to paise instead of rounding off to whole rupees', () => {
    const budgets = [
      budget('2026-08', '__income__', '5000.75'),
      budget('2026-08', 'Rent', '4000.25'),
    ]
    const state = computeEnvelopeState(budgets, [], '2026-08', categories, ['Home'])
    expect(state.readyToAssign).toBe(1000.5)
  })

  it('does not carry the credit-card payment envelope forward into a new month', () => {
    const budgets = [budget('2026-07', CREDIT_CARD_CATEGORY, '432.25')]
    const state = computeEnvelopeState(budgets, [], '2026-08', categories, ['Home'])
    const cc = state.envelopes.find((e) => e.category === CREDIT_CARD_CATEGORY)!
    expect(cc.assigned).toBe(0)
  })

  it('excludes the credit-card category from totals', () => {
    const budgets = [budget('2026-08', CREDIT_CARD_CATEGORY, '2000'), budget('2026-08', 'Rent', '1000')]
    const expenses = [expense('2026-08-01', CREDIT_CARD_CATEGORY, '500')]
    const state = computeEnvelopeState(budgets, expenses, '2026-08', categories, ['Home'])
    expect(state.totalAssigned).toBe(1000)
    expect(state.totalSpent).toBe(0)
    const cc = state.envelopes.find((e) => e.category === CREDIT_CARD_CATEGORY)!
    expect(cc.isCreditCardPayment).toBe(true)
    expect(cc.group).toBe('')
  })

  it('clamps spentPct to 100 and only shows 100 with no assignment when something was spent', () => {
    const budgets = [budget('2026-08', 'Rent', '100')]
    const expenses = [expense('2026-08-01', 'Rent', '250')]
    const state = computeEnvelopeState(budgets, expenses, '2026-08', categories, ['Home'])
    const rent = state.envelopes.find((e) => e.category === 'Rent')!
    expect(rent.spentPct).toBe(100)
    expect(rent.isOverspent).toBe(true)

    const noAssign = computeEnvelopeState(
      [],
      [expense('2026-08-01', 'Rent', '50')],
      '2026-08',
      categories,
      ['Home'],
    )
    const rentNoAssign = noAssign.envelopes.find((e) => e.category === 'Rent')!
    expect(rentNoAssign.spentPct).toBe(100)

    const noSpend = computeEnvelopeState([], [], '2026-08', categories, ['Home'])
    const rentNoSpend = noSpend.envelopes.find((e) => e.category === 'Rent')
    expect(rentNoSpend?.spentPct).toBe(0)
  })

  it('only keeps groups that have at least one envelope', () => {
    const state = computeEnvelopeState([], [], '2026-08', categories, ['Home', 'Empty Group'])
    expect(state.groups).toEqual(['Home'])
  })
})

it('preserves paise in ready to assign', () => {
 const state = computeEnvelopeState([budget('2026-08','__income__','1000'),budget('2026-08','Rent','600.25')], [], '2026-08', [{name:'Rent',group:'Home'}], ['Home'])
 expect(state.readyToAssign).toBe(399.75)
})

describe('income extra (one-off income this month)', () => {
  function income(month: string, assigned: string, extra: string): BudgetRow {
    return { ...budget(month, INCOME_CATEGORY, assigned), extra }
  }

  it('adds this month\'s extra on top of the monthly income', () => {
    const state = computeEnvelopeState([income('2026-08', '100000', '10000')], [], '2026-08', [], [])
    expect(state.incomeBase).toBe(100000)
    expect(state.incomeExtra).toBe(10000)
    expect(state.income).toBe(110000)
    expect(state.readyToAssign).toBe(110000)
  })

  it('does not carry the extra into the next month, only the monthly income', () => {
    const state = computeEnvelopeState([income('2026-08', '100000', '10000')], [], '2026-09', [], [])
    expect(state.incomeExtra).toBe(0)
    expect(state.income).toBe(100000)
  })

  it('treats a row without an extra as no extra', () => {
    const state = computeEnvelopeState([budget('2026-08', INCOME_CATEGORY, '5000')], [], '2026-08', [], [])
    expect(state.incomeExtra).toBe(0)
    expect(state.income).toBe(5000)
  })
})

describe('extraForReadyToAssign', () => {
  const month = '2026-09'
  const prev = '2026-08'

  function afterSaving(rows: BudgetRow[], target: number) {
    const before = computeEnvelopeState(rows, [], month, [], [])
    const extra = extraForReadyToAssign(before.incomeBase, before.totalAssigned, target)
    const saved = [
      ...rows.filter((r) => !(r.month === month && r.category === INCOME_CATEGORY)),
      { ...budget(month, INCOME_CATEGORY, String(before.incomeBase)), extra: String(extra) },
    ]
    return {
      now: computeEnvelopeState(saved, [], month, [], []),
      next: computeEnvelopeState(saved, [], '2026-10', [], []),
    }
  }

  it('lands RTA on the typed amount without touching the monthly income', () => {
    const rows = [budget(prev, INCOME_CATEGORY, '50000'), budget(prev, 'Food', '8000'), budget(prev, 'Rent', '20000')]
    const { now, next } = afterSaving(rows, 5000)
    expect(now.readyToAssign).toBe(5000)
    expect(now.incomeBase).toBe(50000)
    expect(next.income).toBe(50000)
  })

  it('goes negative when there is less than the monthly income this month', () => {
    const rows = [budget(month, INCOME_CATEGORY, '40000'), budget(month, 'Food', '12000')]
    expect(extraForReadyToAssign(40000, 12000, 18000)).toBe(-10000)
    expect(afterSaving(rows, 18000).now.readyToAssign).toBe(18000)
  })

  it('round-trips paise', () => {
    const rows = [budget(month, INCOME_CATEGORY, '10000'), budget(month, 'Food', '1234.56')]
    expect(afterSaving(rows, 99.99).now.readyToAssign).toBe(99.99)
  })
})

describe('computeEnvelopeState: lastSpent from a bounded expense fetch', () => {
  const cats: CategoryRow[] = [
    { name: 'Food', group: 'Needs' },
    { name: 'Rent', group: 'Needs' },
  ]
  const budgets = [budget('2026-06', 'Food', '1000'), budget('2026-06', 'Rent', '5000')]

  it('fills lastSpentDate from the server map for categories outside the fetched window', () => {
    const state = computeEnvelopeState(budgets, [expense('2026-06-03', 'Food', '100')], '2026-06', cats, ['Needs'], {
      Rent: '2026-01-05',
      Food: '2026-05-30',
    })
    const byCat = Object.fromEntries(state.envelopes.map((e) => [e.category, e.lastSpentDate]))
    // A fetched row newer than the map wins (the map can lag a just-logged expense).
    expect(byCat).toEqual({ Food: '2026-06-03', Rent: '2026-01-05' })
  })

  it('without a map, behaves as before', () => {
    const state = computeEnvelopeState(budgets, [expense('2026-06-03', 'Food', '100')], '2026-06', cats, ['Needs'])
    expect(state.envelopes.find((e) => e.category === 'Rent')?.lastSpentDate).toBeUndefined()
  })
})
