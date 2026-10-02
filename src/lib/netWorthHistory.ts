import type { HoldingEventRow, HoldingRow } from '@/src/types'

export interface NetWorthPoint {
  /** Epoch ms. */
  t: number
  value: number
}

/** Net worth over time, rebuilt by walking holding events backward from the
 *  current values. Events for holdings that no longer exist (deleted/renamed)
 *  are skipped, and value edits made outside an event are folded into the
 *  starting point. Starts at the first event's result. Empty when there's no event history to draw. */
export function netWorthHistory(holdings: HoldingRow[], events: HoldingEventRow[], now = Date.now()): NetWorthPoint[] {
  const values = new Map(holdings.map((h) => [h.name, Number(h.value) || 0]))
  const relevant = events
    .filter((e) => values.has(e.holding_name))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  if (relevant.length === 0) return []

  const total = () => Array.from(values.values()).reduce((s, v) => s + v, 0)
  const points: NetWorthPoint[] = [{ t: now, value: total() }]
  for (let i = relevant.length - 1; i >= 0; i--) {
    const e = relevant[i]
    points.push({ t: Date.parse(e.timestamp), value: total() })
    values.set(e.holding_name, Number(e.previous_value) || 0)
  }
  return points.reverse()
}
