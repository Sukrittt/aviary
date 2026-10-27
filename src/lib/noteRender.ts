/**
 * A category note is plain text in the database. This reads it for the note
 * sheet's read view: checklist lines, and dates, amounts, links and phone
 * numbers inside a line. Nothing here changes what's stored except toggleLine.
 */

export type Segment =
  | { kind: 'text'; text: string }
  /** `days` from today: negative once it's past. */
  | { kind: 'date'; text: string; days: number }
  | { kind: 'amount'; text: string; value: number }
  | { kind: 'url'; text: string; href: string }
  | { kind: 'phone'; text: string; href: string }

/** `check` is set on a checklist line: true once ticked. */
export interface NoteLine {
  check?: boolean
  segments: Segment[]
}

// `- `, `[ ]`, `[x]` and `- [x]`, after any indent.
const CHECK_RE = /^(\s*)(?:-\s\[([ xX])\]|\[([ xX])\]|-(?=\s))\s?(.*)$/

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH_WORD = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const B = '(?<![\\w.,/₹$€£-])' // not glued to the end of another number or word
const E = '(?![\\w/])'

// First alternative to match at a spot wins, so a date's digits never read as money.
const TOKEN_RE = new RegExp(
  [
    `(?<url>\\bhttps?://[^\\s<>"]+|\\bwww\\.[^\\s<>"]+)`,
    `${B}(?<iso>(?<iy>\\d{4})-(?<im>\\d{2})-(?<id>\\d{2}))${E}`,
    `${B}(?<dmy>(?<sd>\\d{1,2})/(?<sm>\\d{1,2})(?:/(?<sy>\\d{4}|\\d{2}))?)${E}`,
    `${B}(?<named>(?<nd>\\d{1,2})(?:st|nd|rd|th)?\\s(?<nm>${MONTH_WORD})\\b(?:,?\\s(?<ny>\\d{4})(?![\\w-]))?)`,
    `${B}(?<phone>(?:\\+\\d{1,3}[ -]?)?\\d(?:[ -]?\\d){9,11})(?![\\w])`,
    `(?<amount>(?:₹|\\brs\\.?|\\binr|\\$|€|£)\\s?\\d[\\d,]*(?:\\.\\d+)?(?:\\s?(?:k|l|lakhs?|lacs?)\\b)?` +
      `|${B}\\d+(?:\\.\\d+)?\\s?(?:k|l|lakhs?|lacs?)\\b` +
      `|${B}\\d{1,3}(?:,\\d{2,3})+(?:\\.\\d+)?${E}` +
      `|${B}\\d{3,}(?:\\.\\d+)?${E})`,
  ].join('|'),
  'gi',
)

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d)
const isDay = (y: number, m: number, d: number) => {
  const t = new Date(utc(y, m, d))
  return m >= 1 && m <= 12 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** Days from `today` (YYYY-MM-DD) to the date, or null if it isn't one. No year: whichever year puts it nearest. */
function daysTo(today: string, d: number, m: number, y?: number): number | null {
  const [ty, tm, td] = today.split('-').map(Number)
  const now = utc(ty, tm, td)
  const years = y !== undefined ? [y < 100 ? 2000 + y : y] : [ty, ty + 1, ty - 1]
  const options = years.filter((year) => isDay(year, m, d)).map((year) => Math.round((utc(year, m, d) - now) / 86_400_000))
  if (!options.length) return null
  return options.reduce((best, n) => (Math.abs(n) < Math.abs(best) ? n : best))
}

function amountOf(text: string): number {
  const match = /(\d[\d,]*(?:\.\d+)?)\s?(k|l|lakhs?|lacs?)?$/i.exec(text.trim())
  if (!match) return 0
  const n = Number(match[1].replace(/,/g, ''))
  const unit = match[2]?.toLowerCase()
  return Math.round(n * (unit === 'k' ? 1_000 : unit ? 100_000 : 1) * 100) / 100
}

function segmentsOf(text: string, today: string): Segment[] {
  const out: Segment[] = []
  let at = 0
  const push = (segment: Segment) => {
    const last = out[out.length - 1]
    if (segment.kind === 'text' && last?.kind === 'text') last.text += segment.text
    else if (segment.text) out.push(segment)
  }
  for (const m of text.matchAll(TOKEN_RE)) {
    const g = m.groups ?? {}
    let raw = m[0]
    let segment: Segment = { kind: 'text', text: raw }
    if (g.url) {
      // A sentence's full stop or a closing bracket isn't part of the link.
      raw = raw.replace(/[.,;:!?)\]]+$/, '')
      segment = { kind: 'url', text: raw, href: /^www\./i.test(raw) ? `https://${raw}` : raw }
    } else if (g.iso || g.dmy || g.named) {
      const days = g.iso
        ? daysTo(today, Number(g.id), Number(g.im), Number(g.iy))
        : g.dmy
          ? daysTo(today, Number(g.sd), Number(g.sm), g.sy ? Number(g.sy) : undefined)
          : daysTo(today, Number(g.nd), MONTHS.indexOf(g.nm.slice(0, 3).toLowerCase()) + 1, g.ny ? Number(g.ny) : undefined)
      if (days !== null) segment = { kind: 'date', text: raw, days }
    } else if (g.phone) {
      segment = { kind: 'phone', text: raw, href: `tel:${raw.replace(/[ -]/g, '')}` }
    } else if (g.amount) {
      segment = { kind: 'amount', text: raw, value: amountOf(raw) }
    }
    push({ kind: 'text', text: text.slice(at, m.index) })
    push(segment)
    at = m.index + raw.length
  }
  push({ kind: 'text', text: text.slice(at) })
  return out
}

/** The note line by line, `today` as YYYY-MM-DD. */
export function parseNote(note: string, today: string): NoteLine[] {
  return note.split('\n').map((line) => {
    const check = CHECK_RE.exec(line)
    if (!check) return { segments: segmentsOf(line, today) }
    const mark = check[2] ?? check[3]
    return { check: mark !== undefined && mark !== ' ', segments: segmentsOf(check[4], today) }
  })
}

/** Ticks or unticks checklist line `index`, written back as `[x]`/`[ ]`. Any other line: the note unchanged. */
export function toggleLine(note: string, index: number): string {
  const lines = note.split('\n')
  const check = CHECK_RE.exec(lines[index] ?? '')
  if (!check) return note
  const mark = check[2] ?? check[3]
  const done = mark !== undefined && mark !== ' '
  lines[index] = `${check[1]}[${done ? ' ' : 'x'}] ${check[4]}`
  return lines.join('\n')
}

export function checklistCount(note: string): { done: number; total: number } {
  const items = parseNote(note, '2000-01-01').filter((l) => l.check !== undefined)
  return { done: items.filter((l) => l.check).length, total: items.length }
}

export function noteAmounts(note: string, today: string): number[] {
  return parseNote(note, today).flatMap((l) => l.segments.flatMap((s) => (s.kind === 'amount' ? [s.value] : [])))
}

/** With two amounts or more, what they add up to and how far that is from the goal (negative: short). */
export function goalFit(note: string, goal: number, today: string): { sum: number; diff: number } | null {
  const amounts = noteAmounts(note, today)
  if (amounts.length < 2) return null
  const sum = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100
  return { sum, diff: Math.round((sum - goal) * 100) / 100 }
}

export function dayLabel(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}

/** The row glyph's tooltip. */
export function firstLine(note: string): string {
  return note.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
}
