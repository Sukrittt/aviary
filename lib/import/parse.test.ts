import { describe, it, expect } from 'vitest'
import { defaultDirection, detectDateOrder, detectDecimalComma, parseAmount, parseDate } from './parse'

describe('detectDecimalComma', () => {
  it('reads comma as decimal when every amount ends in a comma with cents', () => {
    expect(detectDecimalComma(['1.250,00', '12,5', '1 250,00', '7'])).toBe(true)
  })

  it('reads comma as thousands when amounts end in a dot', () => {
    expect(detectDecimalComma(['1,250.00', '12.50'])).toBe(false)
  })

  it('treats three digits after a lone comma as thousands, not decimals', () => {
    expect(detectDecimalComma(['1,250', '2,000', '300'])).toBe(false)
  })

  it('mixed last separators mean dot decimal', () => {
    expect(detectDecimalComma(['1,25', '1.50'])).toBe(false)
  })
})

describe('parseAmount', () => {
  const dot = (s: string) => parseAmount(s, false)
  const comma = (s: string) => parseAmount(s, true)

  it.each([
    ['1,250.00', 1250],
    ['-1,250.00', -1250],
    ['₹1,250', 1250],
    ['$ 10', 10],
    ['(1,250.00)', -1250],
    ['10 DR', -10],
    ['10 CR', 10],
    ['10DR', -10],
    ['10cr', 10],
    ['10.555', 10.56],
    ['  42 ', 42],
    ['−5.00', -5],
  ])('reads %s with a dot decimal', (raw, expected) => {
    expect(dot(raw)).toBe(expected)
  })

  it.each([
    ['1.250,00', 1250],
    ['1 250,00', 1250],
    ['1 250,00', 1250],
    ['-12,5', -12.5],
    ['€ 3,99', 3.99],
  ])('reads %s with a comma decimal', (raw, expected) => {
    expect(comma(raw)).toBe(expected)
  })

  it.each(['', 'abc', '1.2.3', '--5', '12-'])('rejects %s', (raw) => {
    expect(dot(raw)).toBeNull()
  })
})

describe('detectDateOrder', () => {
  it('a first field above 12 means day first', () => {
    expect(detectDateOrder(['03/04/2026', '17/04/2026'])).toBe('dmy')
  })

  it('a second field above 12 means month first', () => {
    expect(detectDateOrder(['03/04/2026', '04/17/2026'])).toBe('mdy')
  })

  it('defaults to day first when nothing decides it', () => {
    expect(detectDateOrder(['03/04/2026', '2026-10-01'])).toBe('dmy')
  })
})

describe('parseDate', () => {
  it.each([
    ['2026-10-01', '2026-10-01'],
    ['2026-10-01T23:30:00+05:30', '2026-10-01'],
    ['2026-10-01 08:00', '2026-10-01'],
    ['01/10/2026 13:45:00', '2026-10-01'],
    ['1.10.2026', '2026-10-01'],
    ['01-10-26', '2026-10-01'],
    ['17 Oct 2026', '2026-10-17'],
    ['17-Sept-2026', '2026-09-17'],
    ['Sep 17, 2026', '2026-09-17'],
    ['October 3, 2026', '2026-10-03'],
    ['46296', '2026-10-01'],
  ])('reads %s day first', (raw, expected) => {
    expect(parseDate(raw, 'dmy')).toBe(expected)
  })

  it('reads month first when told to', () => {
    expect(parseDate('10/01/2026', 'mdy')).toBe('2026-10-01')
  })

  it.each(['', '31/02/2026', '17 अक्टूबर 2026', 'yesterday', '13/13/2026', '2026-13-01'])('rejects %s', (raw) => {
    expect(parseDate(raw, 'dmy')).toBeNull()
  })
})

describe('defaultDirection', () => {
  it('negative is spend by default', () => {
    expect(defaultDirection([-10, -20, 500], false)).toBe('negative_spend')
  })

  it('flips when more than 80% of amounts are positive and nothing says which way', () => {
    expect(defaultDirection([10, 20, 30, 40, 50, -5], false)).toBe('positive_spend')
  })

  it('keeps negative spend at exactly 80% positive', () => {
    expect(defaultDirection([10, 20, 30, 40, -5], false)).toBe('negative_spend')
  })

  it('a direction column overrides the sign heuristic', () => {
    expect(defaultDirection([10, 20, 30, 40, 50], true)).toBe('negative_spend')
  })
})
