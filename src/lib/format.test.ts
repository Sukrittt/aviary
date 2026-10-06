import { describe, expect, it } from 'vitest'
import { formatINR, formatCurrency, formatDateTime, formatDate, formatDateShort, formatShortDate, formatOrdinalDate } from './format'

describe('formatINR', () => {
  it('groups digits using Indian lakh/crore placement', () => {
    expect(formatINR(1234567)).toBe('₹12,34,567')
  })

  it('does not group amounts under 1000', () => {
    expect(formatINR(999)).toBe('₹999')
  })

  it('keeps exact decimal values instead of rounding', () => {
    expect(formatINR(78.84)).toBe('₹78.84')
    expect(formatINR(1234.6)).toBe('₹1,234.60')
  })

  it('omits decimals for whole-rupee values', () => {
    expect(formatINR(79)).toBe('₹79')
  })

  it('prefixes negative values with a minus sign before the rupee symbol', () => {
    expect(formatINR(-500)).toBe('-₹500')
  })
})

describe('formatCurrency', () => {
  it('formats normally when hide is false', () => {
    expect(formatCurrency(500)).toBe('₹500')
  })

  it('masks the value when hide is true', () => {
    expect(formatCurrency(500, true)).toBe('₹••••')
  })
})

describe('date formatters', () => {
  it('formatDateTime formats a valid timestamp', () => {
    expect(formatDateTime('2026-08-12T15:45:00')).toBe('12 Aug, 3:45 PM')
  })

  it('formatDateTime returns empty string for empty input', () => {
    expect(formatDateTime('')).toBe('')
  })

  it('formatDateTime passes through an unparseable string', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
  })

  it('formatDate formats a valid date', () => {
    expect(formatDate('2026-08-12')).toBe('12 Aug 2026')
  })

  it('formatDate passes through an unparseable string', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })

  it('formatDateShort formats without the year', () => {
    expect(formatDateShort('2026-08-12')).toBe('12 Aug')
  })
})

it('suppresses negative zero', () => expect(formatINR(-0.004)).toBe('₹0'))


describe('formatOrdinalDate', () => {
  it.each([
    ['2026-10-01', '1st Oct'], ['2026-10-02', '2nd Oct'], ['2026-10-03', '3rd Oct'],
    ['2026-10-04', '4th Oct'], ['2026-10-11', '11th Oct'], ['2026-10-12', '12th Oct'],
    ['2026-10-13', '13th Oct'], ['2026-10-21', '21st Oct'], ['2026-10-22', '22nd Oct'],
    ['2026-10-23', '23rd Oct'], ['2026-10-31', '31st Oct'],
  ])('formats %s as %s without moving the calendar date', (input, expected) => {
    expect(formatOrdinalDate(input)).toBe(expected)
  })

  it('omits invalid dates', () => {
    expect(formatOrdinalDate('')).toBe('')
    expect(formatOrdinalDate('invalid')).toBe('')
  })
})

describe('date-only strings are calendar dates, in every timezone', () => {
  // Server-rendered pages format these on a UTC server and again in the
  // browser; the two must agree, and a due date must not slip a day west of UTC.
  it.each(['America/Los_Angeles', 'Pacific/Kiritimati', 'UTC'])('in %s', (tz) => {
    const before = process.env.TZ
    process.env.TZ = tz
    try {
      expect(formatDateShort('2026-10-20')).toBe('20 Oct')
      expect(formatShortDate('2026-10-20')).toBe("20 Oct '26")
    } finally {
      process.env.TZ = before
    }
  })
})
