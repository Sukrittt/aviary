import { describe, expect, it } from 'vitest'
import { computeEnvelopeState, extraForReadyToAssign, shiftMonthKey, CREDIT_CARD_CATEGORY, INCOME_CATEGORY, type Carry } from './envelope'
import { fundBehindGoals, goalLine, goalProgress } from './goal'
import { rolledOverLine, rolloverCard } from './rollover'
import { evaluateAmount, pushAmountKey } from './calcAmount'
import { matchCategory } from './matchCategory'
import { computeShare, feeDiff, round2 } from './split'
import { monthWeeks, weekPace } from './weekly'
import type { BudgetRow, CategoryRow, ExpenseRow } from '@/src/types'

/**
 * Web and Mobile each keep their own copy of the money math (src/lib on both
 * sides). This file is byte-identical in both repos apart from the test-runner
 * import, and pins exact outputs, so the two copies can't drift apart without
 * one side's suite failing. Change a number here only together with the twin.
 */

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const budget = (month: string, category: string, assigned: string, extra: Partial<BudgetRow> = {}): BudgetRow =>
  ({ month, category, assigned, rolled_over: '0', version: 0, ...extra })
const spend = (date: string, category: string, amount: string): ExpenseRow =>
  ({ timestamp: date, date, item: 'x', amount_inr: amount, category, notes: '', source: '', amount, description: '', payment_method: '' })
const categories: CategoryRow[] = [{ name: 'Food', group: 'Needs' }, { name: 'Travel', group: 'Wants' }]

describe('parity: computeEnvelopeState', () => {
  const month = '2026-12'
  const carry: Carry = { ready_to_assign: -150.25, rolled_over: { Food: -500, Travel: 1500.5 } }
  const rows = [
    budget(month, INCOME_CATEGORY, '0', { landed: '40000', extra: '1200.75' }),
    budget(month, 'Food', '12000'),
    budget('2026-11', 'Travel', '3000'),
    budget(month, CREDIT_CARD_CATEGORY, '900'),
  ]
  const expenses = [
    spend(`${month}-01`, 'Food', '450.1'),
    spend(`${month}-31`, 'Food', '0.2'),
    spend(`${month}-15`, 'Travel', '-200'),
    spend(`${month}-20`, CREDIT_CARD_CATEGORY, '300'),
    spend(`${month}-10`, 'Gone', '99.99'),
    spend('2026-11-30', 'Food', '10000'),
  ]

  it('after payday', () => {
    const s = computeEnvelopeState(rows, expenses, month, categories, ['Needs', 'Wants'], undefined, carry)
    expect({ income: s.income, totalAssigned: s.totalAssigned, totalSpent: s.totalSpent, readyToAssign: s.readyToAssign, funded: s.funded }).toEqual({
      income: 41200.75, totalAssigned: 15000, totalSpent: 350.29, readyToAssign: 25950.51, funded: true,
    })
    expect(s.envelopes.map((e) => [e.category, e.assigned, e.available, e.isOverspent])).toEqual([
      ['Food', 12000, 11049.7, false],
      ['Travel', 3000, 4700.5, false],
      [CREDIT_CARD_CATEGORY, 900, 600, false],
    ])
  })

  it('before payday', () => {
    const unpaid = rows.map((r) => (r.category === INCOME_CATEGORY ? { ...r, landed: '0' } : r))
    const s = computeEnvelopeState(unpaid, expenses, month, categories, [], undefined, carry)
    expect({ readyToAssign: s.readyToAssign, totalAssigned: s.totalAssigned, funded: s.funded }).toEqual({ readyToAssign: 950.51, totalAssigned: 0, funded: false })
    expect(s.envelopes.map((e) => [e.category, e.available, e.planPending ?? false])).toEqual([
      ['Food', -950.3, true],
      ['Travel', 1700.5, true],
      [CREDIT_CARD_CATEGORY, 600, false],
    ])
  })

  it('extraForReadyToAssign and shiftMonthKey', () => {
    expect(extraForReadyToAssign(40000, 15000, 25000.5, -150.25)).toBe(150.75)
    expect([shiftMonthKey('2026-01', -1), shiftMonthKey('2026-12', 1), shiftMonthKey('2026-03', -27)]).toEqual(['2025-12', '2027-01', '2023-12'])
  })
})

describe('parity: goals', () => {
  it.each([
    [{ goal: { amount: 12000, by: '2027-05' }, month: '2026-12', available: 2000, assigned: 1000, spent: 0 }, 'behind', 'Behind by ₹834 · ₹1,834/mo to make it by May 2027'],
    [{ goal: { amount: 12000, by: '2027-05' }, month: '2026-12', available: 3000, assigned: 2000, spent: 0 }, 'onTrack', 'On track · ₹1,800/mo from Jan to make it by May 2027'],
    [{ goal: { amount: 5000, by: '2026-12' }, month: '2026-12', available: 4000.5, assigned: 1000, spent: 0 }, 'behind', 'Behind by ₹999.5 · Add it to make it by Dec 2026'],
    [{ goal: { amount: 5000, by: '2026-11' }, month: '2026-12', available: 100, assigned: 0, spent: 0 }, 'done', 'Done'],
    [{ goal: { amount: 5000, by: '2026-10', repeat: 'yearly' }, month: '2026-12', available: 100, assigned: 0, spent: 0 }, 'behind', 'Behind by ₹446 · ₹446/mo to make it by Oct 2027'],
    [{ goal: { amount: 5000 }, month: '2026-12', available: 1500, assigned: 500, spent: 0 }, 'saving', 'At this pace, by Jul 2027'],
    [{ goal: { amount: 5000 }, month: '2026-12', available: 5000, assigned: 0, spent: 0 }, 'funded', 'Funded'],
  ] as const)('%#: %s', (input, status, line) => {
    const p = goalProgress(input as Parameters<typeof goalProgress>[0])!
    expect(p.status).toBe(status)
    expect(goalLine(p, money)).toBe(line)
  })

  it('fundBehindGoals', () => {
    expect(fundBehindGoals(1000.5, [
      { category: 'B', by: '2027-03', behindBy: 700 },
      { category: 'A', by: '2027-01', behindBy: 400.25 },
      { category: 'C', by: '2027-06', behindBy: 900 },
    ])).toEqual([{ category: 'A', amount: 400.25 }, { category: 'B', amount: 600.25 }])
  })
})

describe('parity: rollover copy', () => {
  it('rolledOverLine and rolloverCard', () => {
    expect(rolledOverLine(95, '2027-01', money)).toBe('+₹95 from December')
    expect(rolledOverLine(-20.5, '2027-01', money)).toBe('₹20.5 short from December')
    expect(rolloverCard({ ready_to_assign: 300, rolled_over: { Food: -120, Travel: 80.5 } }, '2027-01', money)).toBe('₹380.5 rolled over · ₹120 short')
    expect(rolloverCard({ ready_to_assign: -50, rolled_over: {} }, '2027-01', money)).toBe('₹50 short from December')
    expect(rolloverCard({ ready_to_assign: 100, rolled_over: { Food: 200 } }, '2027-01', money, [budget('2027-01', 'Food', '0', { rolled_over: '200' })])).toBe('₹300 rolled over')
  })
})

describe('parity: amount keypad and bill split', () => {
  it('evaluateAmount and pushAmountKey', () => {
    expect(['1200+5+', '0.1+0.2', '10−20', '2×3+4', '5÷0', '100÷3', ''].map(evaluateAmount)).toEqual([1205, 0.3, -10, 10, 0, 33.33, 0])
    expect([pushAmountKey('', '+'), pushAmountKey('0', '5'), pushAmountKey('5.5', '.'), pushAmountKey('5.55', '1'), pushAmountKey('1+2', '×'), pushAmountKey('123456789', '0')])
      .toEqual(['', '5', '5.5', '5.55', '3×', '123456789'])
  })

  it('computeShare, feeDiff and round2', () => {
    expect(computeShare([{ name: 'Pizza', price: 499, divisor: 3 }, { name: 'Coke', price: 60, divisor: 1 }, { name: 'Theirs', price: 300, divisor: null }])).toBe(226.33)
    expect(feeDiff(612.5, [{ price: 499 }, { price: 60 }])).toBe(53.5)
    expect(round2(1.005)).toBe(1.01)
  })
})

describe('parity: categorization', () => {
  it('matchCategory', () => {
    const words = { swiggy: 'Food', uber: 'Transport', emi: 'Loans', netflix: 'Subscriptions' }
    const cats = ['🍔 Food & Dining', 'Transport', 'Loans', 'Subscriptions']
    expect(['Swiggy dinner', 'UBER to office', 'Home loan EMI', 'netflix uber', 'x', 'constructor'].map((i) => matchCategory(i, words, cats)))
      .toEqual(['🍔 Food & Dining', 'Transport', 'Loans', 'Subscriptions', '', ''])
  })
})

describe('parity: weekly pace', () => {
  it.each(['2026-10', '2027-02', '2028-02'])('spending exactly each week\'s allowance lands %s on its pot to the paisa', (month) => {
    const pot = 10000.55
    const weeks = monthWeeks(month)
    const days = weeks[weeks.length - 1].to
    const spend = new Array<number>(days).fill(0)
    for (const w of weeks) {
      const pace = weekPace(pot, spend, month, w.from)
      spend[w.from - 1] = pace.current.allowance
    }
    const last = weekPace(pot, spend, month, days)
    expect(Math.round(spend.reduce((a, b) => a + b, 0) * 100) / 100).toBe(pot)
    expect(last.left).toBe(0)
    expect(last.monthStatus).toBe('onTrack')
    expect(weeks.reduce((n, w) => n + w.days, 0)).toBe(days)
  })

  it('splits October 2026 into these exact weeks and allowances, and shrinks the next week after an overspend', () => {
    expect(monthWeeks('2026-10').map((w) => [w.from, w.to])).toEqual([[1, 4], [5, 11], [12, 18], [19, 25], [26, 31]])
    const spend = new Array<number>(31).fill(0)
    const allowances = monthWeeks('2026-10').map((w) => {
      const allowance = weekPace(10000.55, spend, '2026-10', w.from).current.allowance
      spend[w.from - 1] = allowance
      return allowance
    })
    expect(allowances).toEqual([1290, 2258, 2258, 2259, 1935.55])
    const after = weekPace(10000.55, [500, 0, 0, 2000], '2026-10', 8)
    expect([after.current.allowance, after.current.usual, after.left]).toEqual([1945, 2258.19, 1945])
  })
})
