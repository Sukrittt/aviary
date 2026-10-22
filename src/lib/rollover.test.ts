import { describe, expect, it } from 'vitest'
import { monthName, rolledOverLine, rolloverCard } from './rollover'

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
