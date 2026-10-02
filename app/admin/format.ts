const IST = 'Asia/Kolkata'

export function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', { timeZone: IST, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function timeAgo(value: Date | string | null | undefined): string {
  if (!value) return 'never'
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (mins < 60) return `${Math.max(mins, 0)}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

/** Now minus `n` days. */
export const daysAgo = (n: number) => new Date(Date.now() - n * 86400000)

export const usd = (n: number) => `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`

/** Chart ranges offered by RangeTabs, in days. */
export const RANGES = [7, 30, 90, 365] as const

/** A `?range=` search param as one of RANGES, else 30. */
export function parseRange(value: string | undefined): number {
  const days = Number(value)
  return (RANGES as readonly number[]).includes(days) ? days : 30
}

export const num = (n: number) => n.toLocaleString('en-IN')

/** The last `n` calendar days in IST as YYYY-MM-DD, oldest first. */
export function lastNDays(n: number): string[] {
  const days: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    days.push(new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA', { timeZone: IST }))
  }
  return days
}

/** Paise as whole rupees, Indian grouping: 1234500 → "₹12,345". */
export const inr = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`

/** Paise as a short rupee figure for axes and tight spaces: "₹1.2L", "₹45K". */
export const inrShort = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { notation: 'compact', maximumFractionDigits: paise / 100 >= 1000 ? 1 : 0 })}`

/** A ratio as a whole percentage, or the missing-value glyph for null. */
export const percent = (ratio: number | null) => (ratio === null ? '—' : `${Math.round(ratio * 100)}%`)
