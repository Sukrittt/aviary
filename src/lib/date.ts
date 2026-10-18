const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Device-local calendar date ("YYYY-MM-DD") for a given instant. Everything the
 * user logs is dated by the day it is *for them*: an IST date would put a
 * Mexico City evening expense on tomorrow. Mirrors Mobile's src/lib/date.ts.
 */
export function toLocalDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The next local date (today included) falling on `day` of the month, clamped to short months. */
export function nextOnDay(day: number, from: Date = new Date()): string {
  const on = (y: number, m: number) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()))
  const thisMonth = on(from.getFullYear(), from.getMonth())
  return toLocalDateString(thisMonth.getDate() >= from.getDate() ? thisMonth : on(from.getFullYear(), from.getMonth() + 1))
}

/** Today's device-local calendar date. */
export function todayLocal(): string {
  return toLocalDateString()
}

/**
 * Local date + full offset-suffixed timestamp for right now, minted on the
 * device (`2026-09-21T08:30:15+05:30`), the same shape as `lib/http.ts::nowIn()`.
 * Used so an offline expense is stamped with the day it was actually logged,
 * not the day the queue happens to flush.
 */
export function nowLocal(at: Date = new Date()): { date: string; timestamp: string } {
  const offset = -at.getTimezoneOffset()
  const abs = Math.abs(offset)
  const date = toLocalDateString(at)
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
  const suffix = `${offset < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  return { date, timestamp: `${date}T${time}${suffix}` }
}

/**
 * Parse a server date. A bare `YYYY-MM-DD` is a calendar day, so it becomes
 * local midnight of that day; `new Date('2026-11-01')` would read it as UTC
 * midnight and show Oct 31 anywhere west of UTC. Full timestamps parse as-is.
 */
export function parseLocalDate(str: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(str)
}

/**
 * Today's IST calendar date, independent of the process timezone. Only for
 * markup the server renders too (EnvelopeGrid's "Last spent"), where server
 * (UTC) and browser must agree or hydration fails. Rendering that label after
 * mount would let it go device-local too.
 */
export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
