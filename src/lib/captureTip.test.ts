import { expect, it } from 'vitest'
import { captureTipReason, NO_TIP_STATE, parseTipState } from './captureTip'
import type { ExpenseRow } from '@/src/types'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const row = (date: string, source = 'manual') => ({ date, source }) as ExpenseRow
const base = { today: '2026-10-08', now: NOW, manualLogs: [] as number[], state: NO_TIP_STATE }

it('shows after two manual logs within ten minutes', () => {
  expect(captureTipReason({ ...base, rows: [row('2026-10-08')], manualLogs: [NOW - 5 * 60_000, NOW] })).toBe('batch')
  expect(captureTipReason({ ...base, rows: [row('2026-10-08')], manualLogs: [NOW - 20 * 60_000, NOW] })).toBeNull()
})

it('shows after two days with nothing logged, not one', () => {
  expect(captureTipReason({ ...base, rows: [row('2026-10-06')] })).toBe('gap')
  expect(captureTipReason({ ...base, rows: [row('2026-10-07'), row('2026-10-01')] })).toBeNull()
  expect(captureTipReason({ ...base, rows: [] })).toBeNull()
})

it('stays quiet once tried, shown three times, shown today, or already used', () => {
  const rows = [row('2026-10-01')]
  expect(captureTipReason({ ...base, rows, state: { ...NO_TIP_STATE, done: true } })).toBeNull()
  expect(captureTipReason({ ...base, rows, state: { ...NO_TIP_STATE, shown: 3 } })).toBeNull()
  expect(captureTipReason({ ...base, rows, state: { ...NO_TIP_STATE, shown: 1, lastShown: NOW - 3_600_000 } })).toBeNull()
  expect(captureTipReason({ ...base, rows: [...rows, row('2026-09-30', 'text')] })).toBeNull()
})

it('reads a stored state defensively', () => {
  expect(parseTipState('{"shown":2,"lastShown":5,"done":true}')).toEqual({ shown: 2, lastShown: 5, done: true })
  expect(parseTipState('{}')).toEqual(NO_TIP_STATE)
})
