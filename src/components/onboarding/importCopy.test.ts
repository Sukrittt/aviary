import { describe, it, expect } from 'vitest'
import { bannerProgress, countsLine, directionCopy, importErrorCopy, listOf, ordinal, skippedCopy } from './importCopy'

describe('import copy', () => {
  it('counts spends, paydays and the date range', () => {
    expect(countsLine({ expense: 1240, income: 36, from: '2019-03-04', to: '2026-10-01' })).toBe('1,240 spends · 36 paydays · Mar 2019 to Oct 2026')
    expect(countsLine({ expense: 1, income: 1, from: '2026-10-01', to: '2026-10-09' })).toBe('1 spend · 1 payday · Oct 2026')
  })

  it('says what was left out and why', () => {
    expect(skippedCopy({ skipped: { transfer: 312, opening_balance: 2, other_currency: 14 }, otherCurrencies: ['USD'], droppedOverCap: 0 })).toEqual([
      'We left out 312 transfers between your accounts, 2 opening balances and 14 rows in USD. They aren’t spending.',
    ])
    expect(skippedCopy({ skipped: { transfer: 1, future: 17, unparseable: 2 }, otherCurrencies: [], droppedOverCap: 0 })).toEqual([
      'We left out 1 transfer between your accounts. They aren’t spending.',
      'We also skipped 2 rows we couldn’t read and 17 rows dated in the future.',
    ])
    expect(skippedCopy({ skipped: {}, otherCurrencies: [], droppedOverCap: 40 })).toEqual([
      'Your file has more than 20,000 rows, so we kept the newest and left out 40 older ones.',
    ])
    expect(skippedCopy({ skipped: {}, otherCurrencies: [], droppedOverCap: 0 })).toEqual([])
  })

  it('names how direction was read', () => {
    expect(directionCopy({ direction: 'negative_spend', directionSource: 'sign' })).toBe('We’re reading negative amounts as spends.')
    expect(directionCopy({ direction: 'positive_spend', directionSource: 'sign' })).toBe('We’re reading positive amounts as spends.')
  })

  it('maps failure codes to written copy and never shows a raw code', () => {
    expect(importErrorCopy('too_big')).toBe('That file’s too big. Export a shorter date range and try again.')
    expect(importErrorCopy('Internal Server Error')).toBe('Check your connection and try again.')
  })

  it('has no em dashes in anything it builds', () => {
    const all = [
      countsLine({ expense: 2, income: 2, from: '2026-01-01', to: '2026-02-01' }),
      ...skippedCopy({ skipped: { transfer: 2, opening_balance: 2, fill: 2, other_currency: 2, unparseable: 2, future: 2, zero: 2 }, otherCurrencies: ['USD', 'EUR'], droppedOverCap: 2 }),
      ...['too_big', 'unreadable', 'no_columns', 'already_importing', 'already_onboarded', 'x'].map(importErrorCopy),
      bannerProgress(4210, 11240),
    ]
    expect(all.join(' ')).not.toMatch(/—/)
  })

  it('small helpers', () => {
    expect(listOf(['a', 'b', 'c'])).toBe('a, b and c')
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '31st'])
    expect(bannerProgress(4210, 11240)).toBe('Bringing in your history · 4,210 of 11,240')
  })
})
