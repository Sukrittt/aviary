import { expect, it } from 'vitest'
import { netWorthHistory } from './netWorthHistory'
import type { HoldingEventRow, HoldingRow } from '@/src/types'

const holding = (name: string, value: number) => ({ name, value: String(value) }) as HoldingRow
const event = (holding_name: string, previous_value: number, new_value: number, timestamp: string) =>
  ({ holding_name, previous_value: String(previous_value), new_value: String(new_value), timestamp }) as HoldingEventRow

const NOW = Date.parse('2026-10-03T00:00:00Z')

// Starts at the first event, not a same-instant point before it (that drew
// a vertical hook at the chart's left edge).
it('walks back from current values through each event', () => {
  const points = netWorthHistory(
    [holding('A', 150), holding('B', 50)],
    [
      event('A', 100, 120, '2026-09-01T00:00:00Z'),
      event('A', 120, 150, '2026-09-10T00:00:00Z'),
    ],
    NOW,
  )
  expect(points.map((p) => p.value)).toEqual([170, 200, 200])
  expect(points.at(-1)!.t).toBe(NOW)
})

it('sorts events by time regardless of input order', () => {
  const points = netWorthHistory(
    [holding('A', 150)],
    [
      event('A', 120, 150, '2026-09-10T00:00:00Z'),
      event('A', 100, 120, '2026-09-01T00:00:00Z'),
    ],
    NOW,
  )
  expect(points.map((p) => p.value)).toEqual([120, 150, 150])
})

it('ignores events for holdings that no longer exist', () => {
  const points = netWorthHistory(
    [holding('A', 100)],
    [event('Gone', 0, 500, '2026-09-01T00:00:00Z'), event('A', 80, 100, '2026-09-02T00:00:00Z')],
    NOW,
  )
  expect(points.map((p) => p.value)).toEqual([100, 100])
})

it('returns nothing without events', () => {
  expect(netWorthHistory([holding('A', 100)], [], NOW)).toEqual([])
})
