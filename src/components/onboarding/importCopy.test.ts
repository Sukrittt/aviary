import { describe, it, expect } from 'vitest'
import { bannerSub, commitSteps, bannerProgress, importEta, countsLine, directionCopy, fileSize, historyDone, importErrorCopy, listOf, ordinal, precheckFile, skippedCopy } from './importCopy'

describe('precheckFile', () => {
  const f = (name: string, size = 10, type = '') => ({ name, size, type })
  it.each([
    [f('export.csv', 0), 'empty_file'],
    [f('export.csv', 5_000_000), 'too_big'],
    [f('Statement.PDF'), 'pdf'],
    [f('IMG_2041.HEIC'), 'image'],
    [f('scan', 10, 'image/png'), 'image'],
    [f('MoneyManager.xls'), 'old_excel'],
    [f('export.xlsx'), null],
    [f('ynab.zip'), null],
  ])('%j is %s', (file, code) => {
    expect(precheckFile(file, 4 * 1024 * 1024)).toBe(code)
  })
})

describe('import copy', () => {
  it('sizes files the way people read them', () => {
    expect(fileSize(300)).toBe('1 KB')
    expect(fileSize(13_000)).toBe('13 KB')
    expect(fileSize(2_400_000)).toBe('2.3 MB')
  })

  it('says the history is in, and how much of it when some rows failed', () => {
    expect(historyDone(135, 0)).toBe('All 135 spends and paydays are in')
    expect(historyDone(135, 3)).toBe('132 of 135 spends and paydays are in')
    expect(historyDone(1, 0)).toBe('It’s all in')
  })

  it('has its own words for the new failure codes', () => {
    for (const code of ['empty', 'empty_file', 'pdf', 'image', 'old_excel']) expect(importErrorCopy(code)).not.toBe(importErrorCopy('network'))
  })

  it('counts spends, paydays and the date range', () => {
    expect(countsLine({ expense: 1240, refund: 0, income: 36, from: '2019-03-04', to: '2026-10-01' })).toBe('1,240 spends · 36 paydays · Mar 2019 to Oct 2026')
    expect(countsLine({ expense: 1, refund: 1, income: 1, from: '2026-10-01', to: '2026-10-09' })).toBe('1 spend · 1 refund · 1 payday · Oct 2026')
    expect(countsLine({ expense: 1240, refund: 14, income: 36, from: '', to: '' })).toBe('1,240 spends · 14 refunds · 36 paydays')
  })

  it('says what was left out and why', () => {
    expect(skippedCopy({ skipped: { transfer: 312, opening_balance: 2, other_currency: 14 }, otherCurrencies: ['USD'] })).toEqual([
      'We left out 312 transfers between your accounts and 2 opening balances. They aren’t spending.',
      'We also skipped 14 rows in USD.',
    ])
    expect(skippedCopy({ skipped: { transfer: 1, future: 17, unparseable: 2 }, otherCurrencies: [] })).toEqual([
      'We left out 1 transfer between your accounts. It isn’t spending.',
      'We also skipped 2 rows we couldn’t read and 17 rows dated in the future.',
    ])
    expect(skippedCopy({ skipped: {}, otherCurrencies: [] })).toEqual([])
  })

  it('names how direction was read', () => {
    expect(directionCopy({ direction: 'negative_spend', directionSource: 'sign' })).toBe('We’re reading negative amounts as spends.')
    expect(directionCopy({ direction: 'positive_spend', directionSource: 'sign' })).toBe('We’re reading positive amounts as spends.')
    expect(directionCopy({ direction: 'negative_spend', directionSource: 'column' })).toBe('Your file marks which rows are spends and which are paydays, so we’re going by that.')
  })

  it('maps failure codes to written copy and never shows a raw code', () => {
    expect(importErrorCopy('too_big')).toBe('That file’s too big. Export a shorter date range and try again.')
    expect(importErrorCopy('Internal Server Error')).toBe('Check your connection and try again.')
    expect(importErrorCopy('not_found')).toBe('That preview’s expired. Upload your file again.')
  })

  it('has no em dashes in anything it builds', () => {
    const all = [
      countsLine({ expense: 2, refund: 2, income: 2, from: '2026-01-01', to: '2026-02-01' }),
      ...skippedCopy({ skipped: { transfer: 2, opening_balance: 2, fill: 2, other_currency: 2, unparseable: 2, future: 2, zero: 2 }, otherCurrencies: ['USD', 'EUR'] }),
      ...['too_big', 'unreadable', 'no_columns', 'already_importing', 'already_onboarded', 'x'].map(importErrorCopy),
      bannerProgress(4210, 11240),
    ]
    expect(all.join(' ')).not.toMatch(/—/)
  })

  it('estimates the time left from the pace so far, once there is a pace', () => {
    const start = '2026-10-19T10:00:00Z'
    const at = (s: number) => Date.parse(start) + s * 1000
    expect(importEta(0, 25000, start, at(60))).toBeNull()
    expect(importEta(500, 25000, start, at(5))).toBeNull()
    expect(importEta(500, 25000, null, at(60))).toBeNull()
    expect(importEta(25000, 25000, start, at(60))).toBeNull()
    // 1,000 rows a minute, 24,000 to go.
    expect(importEta(1000, 25000, start, at(60))).toBe('About 24 min left')
    expect(importEta(24500, 25000, start, at(60))).toBe('Almost there')
    expect(importEta(100, 25000, start, at(60))).toBe('About 4 hr left')
  })

  it('reassures under the progress, with the estimate when there is one', () => {
    expect(bannerSub('About 24 min left')).toBe('About 24 min left · Keep using Aviary. We’ll tell you when it’s in.')
    expect(bannerSub(null)).toBe('Keep using Aviary. We’ll tell you when it’s in.')
  })

  it('small helpers', () => {
    expect(listOf(['a', 'b', 'c'])).toBe('a, b and c')
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '31st'])
    expect(bannerProgress(4210, 11240)).toBe('Bringing in your history · 4,210 of 11,240')
  })
})

describe('commitSteps', () => {
  it('names only the writes this import has', () => {
    expect(commitSteps(6, 2, true)).toEqual(['Making your 6 envelopes…', 'Adding your 2 accounts…', 'Setting up your payday…', 'Filling this month’s budget…'])
    expect(commitSteps(0, 0, true)).toEqual(['Setting up your payday…', 'Filling this month’s budget…'])
  })
})
