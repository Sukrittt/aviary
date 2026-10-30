/**
 * Cell-level parsing for imported exports: amounts, dates and which way money
 * moved. Every decision that depends on the whole file (decimal separator,
 * date order, sign convention) is made once from the file's own values, never
 * per row, so one odd row can't flip how the rest are read.
 */

export type DateOrder = 'dmy' | 'mdy'
export type Direction = 'negative_spend' | 'positive_spend'

/**
 * Comma is the decimal separator when no amount ends in a dot plus cents and at
 * least one ends in a comma plus cents or groups its thousands with dots (50.000).
 * `threeDecimals` is for dinars (KWD, BHD, OMR, JOD), where 12.500 is twelve and a half.
 */
export function detectDecimalComma(samples: string[], threeDecimals = false): boolean {
  let evidence = false
  for (const raw of samples) {
    // 1.5E+03 says nothing about separators, and stripped it reads like 1.503.
    if (/\de[-+]?\d/i.test(raw)) continue
    const t = raw.replace(WORD_DOT, '').replace(/[^\d.,]/g, '')
    const i = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'))
    if (i < 0) continue
    if (t[i] === '.') {
      // Same rule as 1,250 below: outside dinars no money has three decimals, so 50.000 is thousands.
      if (threeDecimals || !/^[1-9]\d{0,2}(?:\.\d{3})+$/.test(t)) return false
      evidence = true
      continue
    }
    const after = t.length - i - 1
    if (after >= 1 && after <= 2) evidence = true
  }
  return evidence
}

const MAX_AMOUNT = 1_000_000_000_000

// The dot in "Rs. 1,250" or "Rp. 50.000" ends a word, it isn't one of the amount's separators.
const WORD_DOT = /\p{L}+\./gu

/**
 * A written Dr or Cr at either end: "10 DR", "Dr. 10". The lookaround keeps
 * currency codes out: IDR and SCR end in a marker, CRC starts with one.
 */
export const drCrMarker = (s: string) => s.match(/\s*(?<![a-z])(CR|DR)\.?$/i) ?? s.match(/^(CR|DR)(?![a-z])\.?\s*/i)

/** A signed amount in major units, rounded to cents, or null. */
export function parseAmount(raw: string, decimalComma: boolean): number | null {
  let s = raw.trim().replace(/[−‒–]/g, '-')
  let sign = 1
  const marker = drCrMarker(s)
  if (marker) s = s.replace(marker[0], '')
  if (/^\(.*\)$/.test(s)) {
    sign = -sign
    s = s.slice(1, -1)
  }
  // Excel writes big or tiny numbers as 1.5E+03. Stripping the letter would turn -1e308 into 1308.
  const scientific = s.trim().match(/^(-?)\s*(\d+(?:\.\d+)?e[-+]?\d+)$/i)
  if (scientific) {
    const value = Number(scientific[2])
    if (!(value <= MAX_AMOUNT)) return null
    s = `${scientific[1]}${value.toFixed(2)}`
  } else if (/\de[-+]?\d/i.test(s)) return null
  s = s.replace(WORD_DOT, '').replace(/[^\d.,\-]/g, '')
  if (s.startsWith('-')) {
    sign = -sign
    s = s.slice(1)
  }
  // In a comma-decimal file, 1,250 is still thousands: no money has three decimals.
  // A scientific cell was already rewritten as a dot decimal above.
  const thousands = decimalComma && /^\d{1,3}(?:,\d{3})+$/.test(s)
  s = decimalComma && !scientific && !thousands ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  if (!/^\d+(?:\.\d+)?$/.test(s)) return null
  // Rounding through the exponent keeps 10.555 at 10.56, which `* 100` can't.
  const cents = Number(`${Math.round(Number(`${s}e2`))}e-2`)
  // Past what the app stores (lib/inputValidation.ts's validMoney), or past a number at all.
  if (!Number.isFinite(cents) || cents > MAX_AMOUNT) return null
  if (cents === 0) return 0
  // A written Dr or Cr says which way the money went, whatever sign it also carries.
  if (marker) return marker[1].toUpperCase() === 'DR' ? -cents : cents
  return sign * cents
}

const NUMERIC = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})(?!\d)/

export function detectDateOrder(samples: string[]): DateOrder {
  for (const raw of samples) {
    const m = raw.trim().match(NUMERIC)
    if (!m) continue
    if (Number(m[1]) > 12) return 'dmy'
    if (Number(m[2]) > 12) return 'mdy'
  }
  return 'dmy'
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

function monthNumber(word: string): number | null {
  const w = word.toLowerCase()
  if (w === 'sept') return 9
  if (w.length < 3) return null
  const i = MONTHS.findIndex((m) => m.startsWith(w))
  return i < 0 ? null : i + 1
}

function fullYear(y: string): number {
  const n = Number(y)
  if (y.length === 4) return n
  return n <= 69 ? 2000 + n : 1900 + n
}

function iso(y: number, m: number, d: number): string | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date.toISOString().slice(0, 10)
}

/** `YYYY-MM-DD`, or null for anything this can't read for certain (other-locale month names included). */
export function parseDate(raw: string, order: DateOrder): string | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d{5}(?:\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s))
    if (serial < 20_000 || serial > 80_000) return null
    return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10)
  }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/)
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(NUMERIC)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    return order === 'dmy' ? iso(fullYear(m[3]), b, a) : iso(fullYear(m[3]), a, b)
  }
  m = s.match(/^(\d{1,2})[\s\-/.]*([A-Za-z]+)\.?[\s\-/.,]*(\d{4}|\d{2})(?!\d)/)
  if (m) {
    const month = monthNumber(m[2])
    return month ? iso(fullYear(m[3]), month, Number(m[1])) : null
  }
  m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})(?!\d)/)
  if (m) {
    const month = monthNumber(m[1])
    return month ? iso(Number(m[3]), month, Number(m[2])) : null
  }
  return null
}

/**
 * The sign convention for a file whose direction comes from the sign alone.
 * Single-sign files are almost always spend-only trackers, so more than 80%
 * positive reads positive as spend. The review always shows the flip.
 */
export function defaultDirection(signs: number[], hasDirectionColumn: boolean): Direction {
  if (hasDirectionColumn) return 'negative_spend'
  const nonzero = signs.filter((n) => n !== 0)
  if (!nonzero.length) return 'negative_spend'
  return nonzero.filter((n) => n > 0).length / nonzero.length > 0.8 ? 'positive_spend' : 'negative_spend'
}
