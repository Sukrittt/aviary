import { describe, expect, it } from 'vitest'
import { beforeCutoff, matchCategory } from './service'

describe('matchCategory', () => {
  const existing = ['Eating Out', 'Rent', '🍔']

  it.each([
    ['eating out', 'Eating Out'],
    ['  EATING   OUT ', 'Eating Out'],
    ['Eating-Out', 'Eating Out'],
    ['🍔', '🍔'],
  ])('lands %s on %s', (name, expected) => {
    expect(matchCategory(name, existing)).toBe(expected)
  })

  it('leaves a different name out, and a different emoji too', () => {
    expect(matchCategory('Eating', existing)).toBeUndefined()
    expect(matchCategory('🍕', existing)).toBeUndefined()
  })
})

describe('beforeCutoff', () => {
  const rows = [{ date: '2026-09-30' }, { date: '2026-10-01' }, { date: '2026-10-02' }]

  it('keeps only what’s strictly older, and counts the rest', () => {
    expect(beforeCutoff(rows, '2026-10-01')).toEqual({ kept: [{ date: '2026-09-30' }], after: 2 })
  })

  it('keeps everything without a cutoff', () => {
    expect(beforeCutoff(rows, null)).toEqual({ kept: rows, after: 0 })
  })
})
