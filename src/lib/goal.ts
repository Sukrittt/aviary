// A savings goal on an envelope: a target, an optional "by" month, an optional
// yearly repeat. Progress is the envelope's own balance (computeEnvelopeState,
// carry included), so a goal adds no money of its own. Pure, like envelope.ts.
import { monthAbbrev, shiftMonthKey } from './envelope'
import type { CategoryGoal } from '@/src/types'

export type GoalStatus = 'funded' | 'onTrack' | 'behind' | 'saving' | 'done'

export interface GoalProgress {
  target: number
  /** The envelope's balance. Negative when it's overspent. */
  saved: number
  /** 0 to 100, for the bar. */
  pct: number
  status: GoalStatus
  /** The deadline in play: a yearly goal's next one once this year's has passed. */
  by?: string
  /** What to assign each month, this one included, to make the deadline. */
  monthlyNeed?: number
  /** How far this month's assigned falls short of monthlyNeed. */
  behindBy?: number
  /** On track: what each month from `nextMonth` on needs, now this month's is in. Overfund this month and it drops. */
  nextNeed?: number
  nextMonth?: string
  /** No deadline: the month this month's assigned, kept up, gets there. Null when nothing's assigned. */
  paceMonth?: string | null
}

export interface GoalInput {
  goal: CategoryGoal
  month: string
  available: number
  assigned: number
  spent: number
  /** A re-created category's first month. Before it, there's no envelope and no goal. */
  since?: string
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** The first yearly repeat of `by` after `month`: what "Repeat" moves a goal to. */
export function nextGoalMonth(by: string, month: string): string {
  const years = Math.floor(monthsBetween(by, month) / 12) + 1
  return shiftMonthKey(by, Math.max(1, years) * 12)
}

export function goalProgress({ goal, month, available, assigned, spent, since }: GoalInput): GoalProgress | null {
  if (since && since > month) return null
  const target = goal.amount
  // A yearly goal's deadline rolls a year on once its month is over.
  const by = goal.by && goal.repeat === 'yearly' && goal.by < month ? nextGoalMonth(goal.by, shiftMonthKey(month, -1)) : goal.by
  const out = { target, saved: available, pct: Math.max(0, Math.min(100, (available / target) * 100)), by }

  if (available >= target) return { ...out, status: 'funded' }
  if (by) {
    // Saved up, then spent in the month it was for. Or a one-off whose month is over.
    if ((by <= month && spent > 0 && available + spent >= target) || by < month) return { ...out, status: 'done' }
  }

  // What was there before this month's assigned, so assigning the suggestion
  // doesn't move the suggestion.
  const before = available - assigned
  if (!by) {
    return { ...out, status: 'saving', paceMonth: assigned > 0 ? shiftMonthKey(month, Math.ceil((target - before) / assigned) - 1) : null }
  }
  // Never below 0: a negative assigned can hide carry that already covers it.
  const left = monthsBetween(month, by)
  const monthlyNeed = Math.max(0, Math.ceil((target - before) / (left + 1)))
  if (assigned < monthlyNeed) return { ...out, status: 'behind', monthlyNeed, behindBy: Math.round((monthlyNeed - assigned) * 100) / 100 }
  // On track: the rest, spread over the months still to come. Not funded, so there is at least one.
  return { ...out, status: 'onTrack', monthlyNeed, nextMonth: shiftMonthKey(month, 1), nextNeed: Math.max(0, Math.ceil((target - available) / Math.max(1, left))) }
}

/**
 * Ready to Assign's one-tap "Fund behind goals": each behind goal gets what it's
 * short this month, nearest deadline first, until Ready to Assign runs out.
 */
export function fundBehindGoals(
  readyToAssign: number,
  goals: { category: string; by: string; behindBy: number }[],
): { category: string; amount: number }[] {
  let left = Math.round(readyToAssign * 100)
  const out: { category: string; amount: number }[] = []
  for (const g of [...goals].sort((a, b) => a.by.localeCompare(b.by))) {
    if (left <= 0) break
    const take = Math.min(left, Math.round(g.behindBy * 100))
    if (take <= 0) continue
    out.push({ category: g.category, amount: take / 100 })
    left -= take
  }
  return out
}

/** "2027-01" -> "Jan 2027". */
export const shortMonth = (key: string) => `${monthAbbrev(key)} ${key.slice(0, 4)}`

/** The row's one line under a goal's bar. */
export function goalLine(p: GoalProgress, money: (n: number) => string): string {
  const make = p.monthlyNeed !== undefined && p.by ? `${money(p.monthlyNeed)}/mo to make it by ${shortMonth(p.by)}` : ''
  switch (p.status) {
    case 'funded': return 'Funded'
    case 'done': return 'Done'
    case 'onTrack': {
      if (p.nextNeed === undefined || !p.nextMonth || !p.by) return 'On track'
      return p.nextMonth === p.by
        ? `On track · ${money(p.nextNeed)} more in ${monthAbbrev(p.by)} makes it`
        : `On track · ${money(p.nextNeed)}/mo from ${monthAbbrev(p.nextMonth)} to make it by ${shortMonth(p.by)}`
    }
    case 'behind': return `Behind by ${money(p.behindBy ?? 0)} · ${make}`
    case 'saving': return p.paceMonth ? `At this pace, by ${shortMonth(p.paceMonth)}` : 'Assign a monthly amount to see when'
  }
}

export type GoalTemplateKey = 'emergency' | 'diwali' | 'holidays' | 'insurance'

/** The next `mm` (1-12) strictly after `month`: this year's if it's still ahead, else next year's. */
function nextMonthOf(month: string, mm: number): string {
  const key = `${month.slice(0, 4)}-${String(mm).padStart(2, '0')}`
  return key > month ? key : shiftMonthKey(key, 12)
}

/** Starting points for a new goal: a name and a deadline. The amount is the user's. */
export function goalTemplate(key: GoalTemplateKey, month: string): { name: string; by: string; yearly: boolean } {
  switch (key) {
    case 'emergency': return { name: 'Emergency fund', by: '', yearly: false }
    // Diwali lands in October or November; October has the money ready either way.
    case 'diwali': return { name: 'Diwali', by: nextMonthOf(month, 10), yearly: true }
    // The year-end season, for budgets outside India.
    case 'holidays': return { name: 'Holidays', by: nextMonthOf(month, 12), yearly: true }
    case 'insurance': return { name: 'Insurance', by: shiftMonthKey(month, 12), yearly: true }
  }
}
