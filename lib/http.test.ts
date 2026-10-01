import { describe, it, expect } from 'vitest'
import { EMAIL_RE, escapeRegExp, nowIn, nowIST, isValidTimezone, parsePageParams } from './http'

describe('EMAIL_RE', () => {
  it('accepts ordinary addresses', () => {
    expect(EMAIL_RE.test('a@b.com')).toBe(true)
    expect(EMAIL_RE.test('first.last+tag@sub.example.co')).toBe(true)
  })

  it('rejects addresses missing an @ or a domain dot', () => {
    expect(EMAIL_RE.test('not-an-email')).toBe(false)
    expect(EMAIL_RE.test('a@b')).toBe(false)
    expect(EMAIL_RE.test('@b.com')).toBe(false)
    expect(EMAIL_RE.test('a@')).toBe(false)
    expect(EMAIL_RE.test('a b@c.com')).toBe(false)
    expect(EMAIL_RE.test('')).toBe(false)
  })
})

describe('escapeRegExp', () => {
  it('escapes regex metacharacters so the result matches only the literal string', () => {
    const raw = 'a.b*c?'
    const re = new RegExp(escapeRegExp(raw))
    expect(re.test('a.b*c?')).toBe(true)
    expect(re.test('aXbXcX')).toBe(false)
  })
})

describe('nowIn', () => {
  const at = new Date('2026-03-31T20:00:00Z')

  it('matches the legacy IST behaviour by default', () => {
    expect(nowIn(undefined, at)).toEqual({ date: '2026-04-01', timestamp: '2026-04-01T01:30:00+05:30' })
    expect(nowIST().timestamp.endsWith('+05:30')).toBe(true)
  })

  it('rolls the calendar date per timezone (month boundary)', () => {
    expect(nowIn('America/Los_Angeles', at)).toEqual({ date: '2026-03-31', timestamp: '2026-03-31T13:00:00-07:00' })
    expect(nowIn('Pacific/Auckland', at).date).toBe('2026-04-01')
    expect(nowIn('Asia/Kathmandu', at).timestamp).toBe('2026-04-01T01:45:00+05:45')
  })

  it('falls back to IST for an unknown zone', () => {
    expect(nowIn('Not/AZone', at).date).toBe('2026-04-01')
  })
})

describe('isValidTimezone', () => {
  it('accepts IANA names and rejects junk', () => {
    expect(isValidTimezone('Europe/London')).toBe(true)
    expect(isValidTimezone('Nope/Nope')).toBe(false)
    expect(isValidTimezone(5)).toBe(false)
    expect(isValidTimezone('')).toBe(false)
  })
})

it('never passes nonfinite pagination values to Mongo', () => {
  for (const value of ['Infinity', '1e100', '-Infinity']) {
    const result = parsePageParams(new URL(`https://example.com/?page=${value}&limit=${value}`), { defaultLimit: 10, maxLimit: 100 })
    expect(Number.isSafeInteger(result.page)).toBe(true)
    expect(result.page * result.limit).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER)
  }
})
