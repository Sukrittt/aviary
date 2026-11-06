import { describe, expect, it } from 'vitest'
import { monthName, rolledOverLine, rolloverCard, rolloverDetail } from './rollover'
import type { BudgetRow } from '@/src/types'

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`

describe('rollover copy', () => {
  it('names the month', () => {
    expect(monthName('2026-10')).toBe('October')
    expect(monthName('2027-01')).toBe('January')
  })

  it('says what an envelope carried in, or how short it came in', () => {
    expect(rolledOverLine(95, '2026-11', money)).toBe('+₹95 from October')
    expect(rolledOverLine(-20, '2026-11', money)).toBe('₹20 short from October')
    expect(rolledOverLine(0, '2026-11', money)).toBeNull()
    expect(rolledOverLine(10, '2027-01', money)).toBe('+₹10 from December')
  })
})

describe('rolloverCard', () => {
  it('says it in one short line, counting money left unassigned as rolled over too', () => {
    expect(rolloverCard({ ready_to_assign: 5000, rolled_over: { A: 1000, B: 800, C: 300, D: 150, E: 50, F: -100, G: -20 } }, '2026-11', money)).toBe('₹7,300 rolled over · ₹120 short')
    expect(rolloverCard({ ready_to_assign: 0, rolled_over: { Travel: 95 } }, '2026-11', money)).toBe('₹95 rolled over')
    expect(rolloverCard({ ready_to_assign: 4600, rolled_over: {} }, '2026-11', money)).toBe('₹4,600 rolled over')
  })

  it('counts an over-assigned month as short too', () => {
    expect(rolloverCard({ ready_to_assign: -300, rolled_over: { Travel: 95 } }, '2026-11', money)).toBe('₹95 rolled over · ₹300 short')
    expect(rolloverCard({ ready_to_assign: -300, rolled_over: { Food: -20 } }, '2026-11', money)).toBe('₹320 short from October')
  })

  it('has nothing to show when nothing rolled, or before the carry has loaded', () => {
    expect(rolloverCard({ ready_to_assign: 0, rolled_over: {} }, '2026-10', money)).toBeNull()
    expect(rolloverCard(undefined, '2026-11', money)).toBeNull()
  })
})

describe('rolloverCard with this month\'s moves', () => {
  const money = (n: number) => `₹${n}`
  const row = (category: string, rolled_over: string) => ({ month: '2026-11', category, assigned: '0', rolled_over, version: 1 })

  it('leaves out money assigned this month: nothing rolled over for a first month', () => {
    const carry = { ready_to_assign: -1000, rolled_over: { Groceries: 1000 } }
    expect(rolloverCard(carry, '2026-11', money, [row('Groceries', '1000')])).toBeNull()
  })

  it('still says what really rolled in after some of it moved', () => {
    const carry = { ready_to_assign: 0, rolled_over: { Travel: 800, Food: 200 } }
    expect(rolloverCard(carry, '2026-11', money, [row('Travel', '-200'), row('Food', '200')])).toBe('₹1000 rolled over')
  })

  it("ignores other months' moves", () => {
    const carry = { ready_to_assign: 0, rolled_over: { Food: 300 } }
    expect(rolloverCard(carry, '2026-11', money, [{ ...row('Food', '50'), month: '2026-10' }])).toBe('₹300 rolled over')
  })
})

describe('rolloverDetail', () => {
  const carry = { ready_to_assign: 0, rolled_over: { Groceries: 666, 'Emergency fund': 16667, 'GTA 6': 3700, __credit_card__: 11426, Transport: -823 } }
  const goals = new Set(['Emergency fund', 'GTA 6'])
  it('names the parts of the rollover that no spending row shows, so the strip adds up against the rows', () => {
    expect(rolloverDetail(carry, '2026-11', money, [], goals)).toBe('Includes ₹20,367 in goals · ₹11,426 for the card bill')
  })
  it('counts money left unassigned too', () => {
    expect(rolloverDetail({ ready_to_assign: 5000, rolled_over: { Food: 95 } }, '2026-11', money)).toBe('Includes ₹5,000 that went to Ready to Assign')
  })
  it('names an over-assigned month, which counts in the short total but sits on no row', () => {
    expect(rolloverDetail({ ready_to_assign: -1200, rolled_over: { Food: 95 } }, '2026-11', money)).toBe('Includes ₹1,200 over-assigned in October')
  })

  it('is null when every rolled amount is on a row', () => {
    expect(rolloverDetail({ ready_to_assign: 0, rolled_over: { Food: 95, Rent: -20 } }, '2026-11', money)).toBeNull()
    expect(rolloverDetail(undefined, '2026-11', money)).toBeNull()
  })
  it("takes this month's moves back out, like the strip", () => {
    const budgets = [{ month: '2026-11', category: 'Food', assigned: '0', rolled_over: '1000' }] as unknown as BudgetRow[]
    expect(rolloverDetail({ ready_to_assign: 4000, rolled_over: { Food: 1095 } }, '2026-11', money, budgets)).toBe('Includes ₹5,000 that went to Ready to Assign')
  })
})
