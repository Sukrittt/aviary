/**
 * The small "we're learning you" moments: how often an item has come up this
 * week, the line that says so after a log, and which days of the first week
 * have an expense. Twin of Mobile's src/lib/noticed.ts.
 */

type Row = { id?: string; date: string; item?: string }

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase()

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** How many times `expense.item` was logged in the 7 days ending on its date, counting it once. */
export function weeklyRepeat(rows: Row[], expense: { id?: string; item: string; date: string }): number {
  const item = norm(expense.item)
  if (!item) return 0
  const from = addDays(expense.date, -6)
  const others = rows.filter((r) => r.id !== expense.id || !expense.id).filter((r) => norm(r.item) === item && r.date >= from && r.date <= expense.date)
  return others.length + 1
}

function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

/** "Noted. That's your 3rd Chai this week." from the second time on. */
export function noticedLine(item: string, count: number): string | null {
  return count >= 2 ? `Noted. That's your ${ordinal(count)} ${item.trim()} this week.` : null
}

// Logged by the server on a schedule, so they don't count toward the recap (see Web lib/weekRecap.ts).
const AUTO_SOURCES = new Set(['recurring', 'subscription'])

type LocalRow = Row & { source?: string; amount_inr?: string }

/**
 * First-week dates with an expense, up to today. The local expense list
 * covers the whole first week and refreshes on every add, edit and delete,
 * so it's the truth once loaded, filtered the way the server's recap is.
 * Until then, the server's dates stand in.
 */
export function learnedDates(serverDates: string[], rows: LocalRow[] | undefined, start: string, today: string): string[] {
  const end = addDays(start, 6) < today ? addDays(start, 6) : today
  const dates = rows
    ? rows
        .filter((r) => !AUTO_SOURCES.has(r.source ?? '') && Number(r.amount_inr) > 0 && norm(r.item))
        .map((r) => r.date)
    : serverDates
  return [...new Set(dates.filter((d) => d >= start && d <= end))].sort()
}
