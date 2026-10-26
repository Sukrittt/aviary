/**
 * Weekly pacing for a monthly envelope. Twin of Mobile/src/lib/weekly.ts, so
 * keep the two in step. Weeks start on Monday and stop at the month's edges,
 * so October 2026 is 1–4, 5–11, 12–18, 19–25, 26–31.
 *
 * Each week's allowance is what the month had left when the week began, spread
 * evenly over the days left, times the week's days. A week that ran over makes
 * the next ones smaller (and an easy one makes them bigger), so staying under
 * every week always lands the month on budget.
 */

export interface MonthWeek {
  /** Day of month the week starts and ends on, inclusive. */
  from: number
  to: number
  days: number
}

export interface WeekResult extends MonthWeek {
  spent: number
  allowance: number
  /** The even share with nothing carried between weeks: pot × days / days in month. */
  usual: number
}

export type PaceStatus = 'onTrack' | 'ahead' | 'over'

export interface WeekPace {
  /** Every week up to and including this one. */
  weeks: WeekResult[]
  current: WeekResult
  /** Where the fill should be by the end of today, 0–100. */
  tickPct: number
  /** This week's spend against its allowance, 0–100. */
  spentPct: number
  /** Days after today before the week resets. 0 on its last day. */
  daysAfterToday: number
  status: PaceStatus
  /** What's left this week. Never more than the month has left. */
  left: number
  /** What's left per day for the rest of the week, when there's a rest of the week. */
  perDay: number | null
  /** Home's month bar: where the fill should be by the end of today, 0–100. */
  monthTickPct: number
  /** The month's spend against its pot, 0–100. */
  monthSpentPct: number
  /** The month bar's tone: behind the tick, past it, or over the pot. */
  monthStatus: PaceStatus
}

const round2 = (n: number) => Math.round(n * 100) / 100

function daysIn(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** The month's Monday-start weeks, clipped to the month. */
export function monthWeeks(monthKey: string): MonthWeek[] {
  const [y, m] = monthKey.split('-').map(Number)
  const dim = daysIn(monthKey)
  const weeks: MonthWeek[] = []
  let from = 1
  for (let d = 2; d <= dim; d++) {
    if (new Date(y, m - 1, d).getDay() === 1) {
      weeks.push({ from, to: d - 1, days: d - from })
      from = d
    }
  }
  weeks.push({ from, to: dim, days: dim - from + 1 })
  return weeks
}

/**
 * Pace for one envelope. `pot` is what the month holds for it (assigned plus
 * anything rolled over); `spendByDay[d - 1]` is what went out on day `d`.
 * `today` is the day of month.
 */
export function weekPace(pot: number, spendByDay: number[], monthKey: string, today: number): WeekPace {
  const dim = daysIn(monthKey)
  const spentBetween = (from: number, to: number) => {
    let s = 0
    for (let d = from; d <= to; d++) s += spendByDay[d - 1] ?? 0
    return s
  }
  const weeks = monthWeeks(monthKey)
    .filter((w) => w.from <= today)
    .map((w): WeekResult => {
      const leftAtStart = Math.max(0, pot - spentBetween(1, w.from - 1))
      // Whole units read cleaner ("₹662", not "₹661.54"). The month's last week
      // keeps the exact remainder so it lands on what the month has left.
      const share = (leftAtStart * w.days) / (dim - w.from + 1)
      return {
        ...w,
        spent: round2(spentBetween(w.from, w.to)),
        allowance: w.to === dim ? round2(share) : Math.round(share),
        usual: round2((pot * w.days) / dim),
      }
    })
  const current = weeks[weeks.length - 1]
  const elapsed = today - current.from + 1
  const tickPct = (elapsed / current.days) * 100
  const spentPct = current.allowance > 0 ? Math.min(100, (current.spent / current.allowance) * 100) : current.spent > 0 ? 100 : 0
  const monthLeft = pot - spentBetween(1, dim)
  const status: PaceStatus = current.spent > current.allowance || monthLeft < 0 ? 'over' : spentPct > tickPct ? 'ahead' : 'onTrack'
  const daysAfterToday = current.to - today
  const left = round2(Math.min(current.allowance - current.spent, monthLeft))
  const perDay = daysAfterToday > 0 && left > 0 ? round2(left / daysAfterToday) : null
  const monthSpent = pot - monthLeft
  const monthTickPct = (today / dim) * 100
  const monthSpentPct = pot > 0 ? Math.min(100, (monthSpent / pot) * 100) : monthSpent > 0 ? 100 : 0
  const monthStatus: PaceStatus = monthLeft < 0 ? 'over' : monthSpentPct > monthTickPct ? 'ahead' : 'onTrack'
  return { weeks, current, tickPct, spentPct, daysAfterToday, status, left, perDay, monthTickPct, monthSpentPct, monthStatus }
}

/** Day-of-month spend for one category, from expense rows. */
export function spendByDay(rows: { date: string; category: string; amount_inr: string | number }[], category: string, monthKey: string): number[] {
  const out = new Array<number>(daysIn(monthKey)).fill(0)
  for (const r of rows) {
    if (r.category !== category || !r.date.startsWith(monthKey)) continue
    out[Number(r.date.slice(8, 10)) - 1] += Number(r.amount_inr) || 0
  }
  return out
}

/** The line under a weekly row's month bar: how this week is going. */
export function paceLine(p: WeekPace, money: (n: number) => string): string {
  if (p.status === 'over') return `${money(p.current.spent - p.current.allowance)} over this week`
  if (p.status === 'ahead') return p.perDay != null ? `Ahead · ${money(Math.round(p.perDay))}/day this week` : `Ahead · ${money(p.left)} left today`
  return 'On track this week'
}

/** "2d left" until the reset, or "Last day". */
export function resetChip(p: WeekPace): string {
  return p.daysAfterToday > 0 ? `${p.daysAfterToday}d left` : 'Last day'
}

/**
 * One amount per week for the sheet's pills, like Home's: what a past week
 * came in under ("₹136") or over ("-₹221") by, or what this week has left.
 * The bar already shows how full it got.
 */
export function weekResult(w: WeekResult, isNow: boolean, left: number, money: (n: number) => string): { text: string; over: boolean } {
  // The sign comes from the exact difference, so it always agrees with the
  // bar; only the shown amount is rounded (to paise if it'd round to 0).
  const raw = round2(isNow ? left : w.allowance - w.spent)
  const shown = Math.round(Math.abs(raw)) || Math.abs(raw)
  return raw < 0 ? { text: `-${money(shown)}`, over: true } : { text: money(shown), over: false }
}

/** Why this week's allowance isn't the usual share. Null when it's about the same. */
export function allowanceNote(p: WeekPace, money: (n: number) => string): string | null {
  const diff = Math.round(p.current.allowance - p.current.usual)
  if (p.weeks.length < 2 || Math.abs(diff) < 1) return null
  if (diff < 0) return `This week's ${money(p.current.allowance)} is ${money(-diff)} less than usual. It makes up for the weeks that ran over. Stay under it and you're back on pace.`
  return `This week's ${money(p.current.allowance)} is ${money(diff)} more than usual, thanks to the weeks you came in under.`
}

/** How last week went, for Monday's card. Null on a month's first week (last week was last month's). */
export function lastWeekResults(paces: { category: string; pace: WeekPace }[]): { under: number; total: number; over: { category: string; by: number; pace: WeekPace }[] } | null {
  const withPrev = paces.filter((p) => p.pace.weeks.length >= 2)
  if (withPrev.length === 0) return null
  const over = withPrev
    .map(({ category, pace }) => {
      const prev = pace.weeks[pace.weeks.length - 2]
      return { category, by: round2(prev.spent - prev.allowance), pace }
    })
    .filter((o) => o.by > 0)
  return { under: withPrev.length - over.length, total: withPrev.length, over }
}

/** Monday's card: a title and one short line. Leads with what went right; a week over is framed as handled. */
export function weeklyRecap(
  r: NonNullable<ReturnType<typeof lastWeekResults>>,
  money: (n: number) => string,
  nameOf: (category: string) => string,
): { tone: 'good' | 'calm'; title: string; detail: string } {
  if (r.under > 0) {
    const detail = r.total === 1 ? 'You stayed under.' : r.under === r.total ? `All ${r.total} categories stayed under.` : `${r.under} of ${r.total} categories stayed under.`
    return { tone: 'good', title: 'Last week, done right', detail }
  }
  const covered = r.over.every((o) => o.pace.current.allowance > 0)
  const detail = covered ? 'This week covers it.' : 'Pull from another category to cover it.'
  if (r.over.length === 1) return { tone: 'calm', title: `${nameOf(r.over[0].category)} ran ${money(r.over[0].by)} over`, detail }
  return { tone: 'calm', title: 'Last week ran a bit over', detail }
}
