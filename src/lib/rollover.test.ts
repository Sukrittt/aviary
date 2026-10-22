import { describe, expect, it } from 'vitest'
import { carriedReadyLine, monthName, rolledOverLine, rolloverCard } from './rollover'

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

  it('says what Ready to assign carried in', () => {
    expect(carriedReadyLine(5000, '2026-11', money)).toBe('includes ₹5,000 from October')
    expect(carriedReadyLine(-1200, '2026-11', money)).toBe('₹1,200 short from October')
    expect(carriedReadyLine(0, '2026-11', money)).toBeNull()
  })
})

describe('rolloverCard', () => {
  it('lists only the non-zero parts', () => {
    expect(rolloverCard({ ready_to_assign: 5000, rolled_over: { A: 1000, B: 800, C: 300, D: 150, E: 50, F: -100, G: -20 } }, '2026-11', money)).toEqual({
      title: 'October rolled into November',
      lines: ['₹2,300 carried across 5 envelopes · ₹5,000 to Ready to Assign', '₹120 short in 2 envelopes'],
    })
    expect(rolloverCard({ ready_to_assign: 0, rolled_over: { Travel: 95 } }, '2026-11', money)?.lines).toEqual(['₹95 carried across 1 envelope'])
    expect(rolloverCard({ ready_to_assign: 0, rolled_over: { Food: -20 } }, '2026-11', money)?.lines).toEqual(['₹20 short in 1 envelope'])
    expect(rolloverCard({ ready_to_assign: -300, rolled_over: {} }, '2026-11', money)?.lines).toEqual(['₹300 short in Ready to Assign'])
  })

  it('has nothing to show when nothing rolled, or before the carry has loaded', () => {
    expect(rolloverCard({ ready_to_assign: 0, rolled_over: {} }, '2026-10', money)).toBeNull()
    expect(rolloverCard(undefined, '2026-11', money)).toBeNull()
  })
})
