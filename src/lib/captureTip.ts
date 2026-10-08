import type { ExpenseRow } from '@/src/types'

/**
 * When to point someone at typing several spends into Ask Aviary at once.
 * Only at a moment it would help, never on a timer:
 * - `batch`: they've just logged two spends by hand within ten minutes.
 * - `gap`: they're back after two or more days with nothing logged, so
 *   there's probably a backlog to catch up on.
 * At most once a day and three times ever, never once they've tried it, and
 * never for someone whose recent spends show they already log this way.
 */
export type CaptureTipReason = 'batch' | 'gap'

export interface CaptureTipState {
  shown: number
  lastShown: number
  done: boolean
}

export const NO_TIP_STATE: CaptureTipState = { shown: 0, lastShown: 0, done: false }

/** LogExpenseModal fires this after each manual save. */
export const MANUAL_LOG_EVENT = 'aviary:manual-log'

const DAY_MS = 86_400_000
const BATCH_WINDOW_MS = 10 * 60_000
const GAP_DAYS = 2
const MAX_SHOWS = 3

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS)
}

export function captureTipReason({ rows, today, now, manualLogs, state }: {
  rows: ExpenseRow[]
  /** The user's local date, YYYY-MM-DD. */
  today: string
  now: number
  /** When this tab saved manual spends, ms. */
  manualLogs: number[]
  state: CaptureTipState
}): CaptureTipReason | null {
  if (state.done || state.shown >= MAX_SHOWS || now - state.lastShown < DAY_MS) return null
  if (rows.some((r) => r.source === 'text')) return null
  if (manualLogs.filter((t) => now - t <= BATCH_WINDOW_MS).length >= 2) return 'batch'
  if (rows.length === 0) return null
  const latest = Math.max(...rows.map((r) => dayNumber(r.date)))
  return dayNumber(today) - latest >= GAP_DAYS ? 'gap' : null
}

export function parseTipState(raw: string): CaptureTipState {
  const v = JSON.parse(raw) as Partial<CaptureTipState>
  return {
    shown: Number(v.shown) || 0,
    lastShown: Number(v.lastShown) || 0,
    done: v.done === true,
  }
}
