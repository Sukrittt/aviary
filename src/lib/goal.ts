// A savings goal on an envelope: a target, an optional "by" month, an optional
// yearly repeat. Progress is the envelope's own balance (computeEnvelopeState,
// carry included), so a goal adds no money of its own. Pure, like envelope.ts.
import { shiftMonthKey } from './envelope'
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
  const monthlyNeed = Math.ceil((target - before) / (monthsBetween(month, by) + 1))
  return assigned >= monthlyNeed
    ? { ...out, status: 'onTrack', monthlyNeed }
    : { ...out, status: 'behind', monthlyNeed, behindBy: Math.round((monthlyNeed - assigned) * 100) / 100 }
}
