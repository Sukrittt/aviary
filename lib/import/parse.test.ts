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

  it('reads dot as thousands when every dot is followed by three-digit groups', () => {
    expect(detectDecimalComma(['50.000', '125.000', '1.250.000'])).toBe(true)
    expect(detectDecimalComma(['50.000', '7'])).toBe(true)
  })

  it('a lone dot plus three digits is no evidence against a comma decimal', () => {
    expect(detectDecimalComma(['5.000', '12,50'])).toBe(true)
  })

  it('any dot with cents still means dot decimal', () => {
    expect(detectDecimalComma(['50.000', '12.50'])).toBe(false)
    expect(detectDecimalComma(['1,250.000'])).toBe(false)
  })

  it('a leading 0. is never a thousands group', () => {
    expect(detectDecimalComma(['0.125', '0.500'])).toBe(false)
  })

  it('in a three-decimal currency, dot plus three digits is the decimal', () => {
    expect(detectDecimalComma(['12.500', '3.250', '-7.125'], true)).toBe(false)
    expect(detectDecimalComma(['12.500', '3.250', '-7.125'])).toBe(true)
  })

  it('scientific cells are no evidence either way', () => {
    expect(detectDecimalComma(['1.5E+03'])).toBe(false)
    expect(detectDecimalComma(['12,50', '2.5E+03'])).toBe(true)
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
    ['12.50EUR', 12.5],
    ['-3 eur', -3],
  ])('reads %s with a dot decimal', (raw, expected) => {
    expect(dot(raw)).toBe(expected)
  })

  it.each([
    ['1.250,00', 1250],
    ['1 250,00', 1250],
    ['1 250,00', 1250],
    ['-12,5', -12.5],
    ['€ 3,99', 3.99],
    // Comma thousands mixed into a comma-decimal file: no money has three decimals.
    ['1,250', 1250],
    ['12,345,678', 12345678],
  ])('reads %s with a comma decimal', (raw, expected) => {
    expect(comma(raw)).toBe(expected)
  })

  it.each([
    ['1.5E+03', 1500],
    ['-2.5e2', -250],
  ])('reads scientific notation %s as the number it is', (raw, expected) => {
    expect(dot(raw)).toBe(expected)
    expect(comma(raw)).toBe(expected)
  })

  it.each(['', 'abc', '1.2.3', '--5', '12--', '9'.repeat(400), '2000000000000', '-1e308', '1e3e4'])('rejects %s', (raw) => {
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

describe('parseAmount, currency words with a dot', () => {
  it.each([
    ['Rs. 50', false, 50],
    ['Rs.1,250.00', false, 1250],
    ['Rs. 1,250', false, 1250],
    ['-Rs. 40.50', false, -40.5],
    ['INR. 500', false, 500],
    ['1,250.00 Rs.', false, 1250],
    ['Rp. 50.000', true, 50000],
  ])('reads %s (comma decimal: %s)', (raw, comma, expected) => {
    expect(parseAmount(raw, comma)).toBe(expected)
  })

  it('still refuses a bare leading dot rather than guess', () => {
    expect(parseAmount('.50', false)).toBeNull()
  })

  it('takes separators after the word as the amount’s own', () => {
    expect(detectDecimalComma(['Rp. 50.000', 'Rp. 125.000'])).toBe(true)
    expect(detectDecimalComma(['Rs. 1,250.00'])).toBe(false)
    expect(detectDecimalComma(['Rs. 12,50'])).toBe(true)
  })
})

describe('parseAmount, an explicit Dr or Cr', () => {
  it.each([
    ['-10 DR', -10],
    ['(10) DR', -10],
    ['-10 CR', 10],
    ['(10) CR', 10],
    ['Dr 10', -10],
    ['Dr. 1,250.00', -1250],
    ['DR10', -10],
    ['Cr 10', 10],
    ['Cr. 10', 10],
  ])('%s is %d, whatever the sign says', (raw, expected) => {
    expect(parseAmount(raw, false)).toBe(expected)
  })

  it('doesn’t mistake a currency code for a marker', () => {
    expect(parseAmount('CRC 500', false)).toBe(500)
    expect(parseAmount('DRAM 500', false)).toBe(500)
    expect(parseAmount('100 IDR', false)).toBe(100)
    expect(parseAmount('100IDR', false)).toBe(100)
    expect(parseAmount('100 SCR', false)).toBe(100)
    expect(parseAmount('-100 IDR', false)).toBe(-100)
  })
})

describe('parseAmount, number shapes', () => {
  it.each([
    ['1,25,000.00', 125000],
    ['1,25,000', 125000],
    ["1'250.50", 1250.5],
    ['+5.00', 5],
    ['-(5.00)', -5],
    ['1.005', 1.01],
    ['-1.005', -1.01],
    ['1,000,000,000,000', 1_000_000_000_000],
  ])('reads %s', (raw, expected) => {
    expect(parseAmount(raw, false)).toBe(expected)
  })

  it.each(['-0.00', '0.004', '-0.004', '(0.00)', '0 DR'])('%s is plain zero, never -0', (raw) => {
    expect(parseAmount(raw, false)).toBe(0)
  })

  it.each(['.', ',', '-', '5.00--', '1,000,000,000,000.01'])('rejects %s', (raw) => {
    expect(parseAmount(raw, false)).toBeNull()
  })
})

describe('parseDate, edges', () => {
  it('knows leap years', () => {
    expect(parseDate('29/02/2028', 'dmy')).toBe('2028-02-29')
    expect(parseDate('29/02/2027', 'dmy')).toBeNull()
  })

  it('pivots two-digit years at 69', () => {
    expect(parseDate('01/01/69', 'dmy')).toBe('2069-01-01')
    expect(parseDate('01/01/70', 'dmy')).toBe('1970-01-01')
    expect(parseDate('17 Oct 26', 'dmy')).toBe('2026-10-17')
  })

  it('reads an ambiguous date by the order it’s given', () => {
    expect(parseDate('1/2/26', 'dmy')).toBe('2026-02-01')
    expect(parseDate('1/2/26', 'mdy')).toBe('2026-01-02')
  })

  it('takes a dated timestamp at face value, offset or not', () => {
    expect(parseDate('2026-10-01T23:30:00Z', 'dmy')).toBe('2026-10-01')
    expect(parseDate('1-Sep-26 10:00 AM', 'dmy')).toBe('2026-09-01')
  })

  it('reads Excel serials only inside its sane range, dropping the time of day', () => {
    expect(parseDate('46296.75', 'dmy')).toBe('2026-10-01')
    expect(parseDate('19999', 'dmy')).toBeNull()
    expect(parseDate('80001', 'dmy')).toBeNull()
  })

  it('needs enough of a month name to be sure', () => {
    expect(parseDate('Janu 5, 2026', 'dmy')).toBe('2026-01-05')
    expect(parseDate('Mar 5 2026', 'dmy')).toBe('2026-03-05')
    expect(parseDate('Ma 5, 2026', 'dmy')).toBeNull()
    expect(parseDate('Janx 5, 2026', 'dmy')).toBeNull()
  })

  it.each(['00/10/2026', '32/10/2026', 'Oct 5', '5th Oct 2026'])('rejects %s', (raw) => {
    expect(parseDate(raw, 'dmy')).toBeNull()
  })
})

describe('defaultDirection, edges', () => {
  it('ignores zeros and reads an empty file as negative spend', () => {
    expect(defaultDirection([0, 0], false)).toBe('negative_spend')
    expect(defaultDirection([0, 0, 0, 5], false)).toBe('positive_spend')
  })
})

describe('parseAmount: how statements really write money', () => {
  it('a currency outside the parentheses still means negative', () => {
    expect(parseAmount('₹(500.00)', false)).toBe(-500)
    expect(parseAmount('$(5.00)', false)).toBe(-5)
    expect(parseAmount('Rs.(5.00)', false)).toBe(-5)
    expect(parseAmount('(₹500.00)', false)).toBe(-500)
  })
  it('a trailing minus is negative, and /- only closes a rupee amount', () => {
    expect(parseAmount('1234.00-', false)).toBe(-1234)
    expect(parseAmount('1,000/-', false)).toBe(1000)
  })
  it('reads Dr in every spelling, without touching a currency code', () => {
    for (const raw of ['500 (Dr)', 'Dr 500', 'DR. 500', '500D', '500 Dr.']) expect(parseAmount(raw, false)).toBe(-500)
    for (const raw of ['500 (Cr)', 'Cr 500', '500C']) expect(parseAmount(raw, false)).toBe(500)
    expect(parseAmount('500 USD', false)).toBe(500)
    expect(parseAmount('500 CAD', false)).toBe(500)
  })
})
