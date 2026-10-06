import { formatMoney, formatMoneyInput, createCurrencyFormat } from './currencies'

/** Legacy pure formatter for INR fixtures and non-user demo data. */
export const formatINR = formatMoney
export const formatCurrency = createCurrencyFormat().formatCurrency
export const formatAmountInput = formatMoneyInput

/** e.g. "2 hours ago" — used by OfflineScreen's "last synced" caption. */
export function formatRelativeTime(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Calendar date only: "4th Oct", without shifting it to the device timezone. */
export function formatOrdinalDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  const day = date.getUTCDate()
  const suffix = day % 100 >= 11 && day % 100 <= 13
    ? 'th' : (['th', 'st', 'nd', 'rd'][day % 10] ?? 'th')
  return `${day}${suffix} ${MONTHS[date.getUTCMonth()]}`
}

/** e.g. "12 Aug, 3:45 PM" — used by Investments' holding rows and event history. */
export function formatDateTime(ts: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  const hours24 = d.getHours()
  const hours12 = hours24 % 12 || 12
  const ampm = hours24 < 12 ? 'AM' : 'PM'
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hours12}:${minutes} ${ampm}`
}

/** e.g. "12 Aug 2026" — date-only, no time. */
export function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * Day and month of `d`. A date-only string ("2026-10-20") is a calendar date,
 * which `new Date` parses as UTC midnight, so it's read back in UTC: in local
 * time it slipped a day west of UTC, and differed between a UTC server render
 * and the browser.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
function calendarParts(input: string, d: Date) {
  return DATE_ONLY.test(input)
    ? { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() }
    : { day: d.getDate(), month: d.getMonth(), year: d.getFullYear() }
}

export function formatDateShort(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  const { day, month } = calendarParts(dateStr, d)
  return `${day} ${MONTHS[month]}`
}

/** "21 Sept '26" — the Activity timeline's row date, shared with Insights so
 *  the same transaction reads identically on both screens. */
export function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const { day, year } = calendarParts(iso, d)
  const month = d.toLocaleDateString('en-IN', { month: 'short', ...(DATE_ONLY.test(iso) ? { timeZone: 'UTC' } : {}) })
  return `${day} ${month} '${String(year).slice(2)}`
}

/** Whole days from now until `ts`, floored at 0 — used for "purges in N days" archive countdowns. */
export function daysUntil(ts: string): number {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return 0
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
}

/** e.g. "27 Aug '26, 1:24 am" — the full stamp shown on the post-log confirmation,
 *  where the year matters because the date can be back-dated by the entry screen. */
export function formatDateTimeLong(ts: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  const hours24 = d.getHours()
  const hours12 = hours24 % 12 || 12
  const ampm = hours24 < 12 ? 'am' : 'pm'
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const year = String(d.getFullYear()).slice(-2)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} '${year}, ${hours12}:${minutes} ${ampm}`
}
