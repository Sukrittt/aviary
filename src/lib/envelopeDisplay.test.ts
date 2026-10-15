import { describe, it, expect, vi, afterEach } from 'vitest'
import { usedPct, usedPctLabel, lastSpentLabel, fillTone } from './envelopeDisplay'
import { toLocalDateString } from './date'

afterEach(() => vi.useRealTimers())

describe('usedPct', () => {
  it('is spend over assigned, rounded', () => {
    expect(usedPct({ assigned: 200, spent: 50 })).toBe(25)
  })

  it('is Infinity when spending against nothing assigned', () => {
    expect(usedPct({ assigned: 0, spent: 10 })).toBe(Infinity)
    expect(usedPctLabel({ assigned: 0, spent: 10 })).toBe('∞')
  })

  it('is an em dash when there is nothing to report', () => {
    expect(usedPct({ assigned: 0, spent: 0 })).toBe(0)
    expect(usedPctLabel({ assigned: 0, spent: 0 })).toBe('—')
  })
})

describe('lastSpentLabel', () => {
  it('reads an expense logged early on an IST morning as Today, not Yesterday', () => {
    // 02:00 IST on 12 March is 20:30 UTC on 11 March. The old web copy
    // compared against the UTC date and called this "Yesterday".
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-11T20:30:00Z'))
    expect(toLocalDateString()).toBe('2026-03-12')
    expect(lastSpentLabel('2026-03-12')).toBe('Today')
  })

  it('labels the day before as Yesterday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-11T20:30:00Z'))
    expect(lastSpentLabel('2026-03-11')).toBe('Yesterday')
  })

  it('falls back to a day count, then a date', () => {
    vi.useFakeTimers()
    // Whole calendar days from local midnight, like Mobile's EnvelopeRow.
    vi.setSystemTime(new Date('2026-03-20T12:00:00Z'))
    expect(lastSpentLabel('2026-03-15')).toBe('5d ago')
    expect(lastSpentLabel('2025-11-03')).toBe('3 Nov')
  })

  it('is an em dash for a missing or unparseable date', () => {
    expect(lastSpentLabel(undefined)).toBe('—')
    expect(lastSpentLabel('not a date')).toBe('—')
  })
})

describe('fillTone', () => {
  it('crosses at 75, 90 and 100 the way the mobile bar does', () => {
    expect(fillTone(0)).toBe('ok')
    expect(fillTone(75)).toBe('ok')
    expect(fillTone(76)).toBe('warn')
    expect(fillTone(90)).toBe('warn')
    expect(fillTone(91)).toBe('danger')
    expect(fillTone(99)).toBe('danger')
    expect(fillTone(100)).toBe('spent')
    expect(fillTone(140)).toBe('spent')
  })
})
