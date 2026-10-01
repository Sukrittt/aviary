import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createThinkingGate, MIN_VISIBLE_MS, SHOW_AFTER_MS } from './thinkingGate'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup() {
  const changes: boolean[] = []
  const gate = createThinkingGate((v) => changes.push(v))
  return { gate, changes }
}

it('never shows thinking for an answer faster than the show delay', () => {
  const { gate, changes } = setup()
  const then = vi.fn()
  gate.start()
  vi.advanceTimersByTime(SHOW_AFTER_MS - 1)
  gate.finish(then)
  vi.advanceTimersByTime(1000)
  expect(changes).toEqual([])
  expect(then).toHaveBeenCalledTimes(1)
})

it('runs the answer right away when nothing was started (dictionary hit)', () => {
  const { gate, changes } = setup()
  const then = vi.fn()
  gate.finish(then)
  expect(then).toHaveBeenCalledTimes(1)
  expect(changes).toEqual([])
})

it('shows after the delay and holds for the minimum before landing', () => {
  const { gate, changes } = setup()
  const then = vi.fn()
  gate.start()
  vi.advanceTimersByTime(SHOW_AFTER_MS)
  expect(changes).toEqual([true])

  vi.advanceTimersByTime(100)
  gate.finish(then)
  expect(then).not.toHaveBeenCalled()
  vi.advanceTimersByTime(MIN_VISIBLE_MS - 101)
  expect(then).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(changes).toEqual([true, false])
  expect(then).toHaveBeenCalledTimes(1)
})

it('lands immediately when thinking has already been up long enough', () => {
  const { gate, changes } = setup()
  const then = vi.fn()
  gate.start()
  vi.advanceTimersByTime(SHOW_AFTER_MS + MIN_VISIBLE_MS + 500)
  gate.finish(then)
  expect(changes).toEqual([true, false])
  expect(then).toHaveBeenCalledTimes(1)
})

it('stays visible when a new lookup starts during the hold', () => {
  const { gate, changes } = setup()
  const stale = vi.fn()
  gate.start()
  vi.advanceTimersByTime(SHOW_AFTER_MS)
  gate.finish(stale)
  gate.start()
  vi.advanceTimersByTime(MIN_VISIBLE_MS * 2)
  expect(changes).toEqual([true])
  expect(stale).not.toHaveBeenCalled()
})

it('cancel hides at once and drops pending work', () => {
  const { gate, changes } = setup()
  const then = vi.fn()
  gate.start()
  vi.advanceTimersByTime(SHOW_AFTER_MS)
  gate.finish(then)
  gate.cancel()
  vi.advanceTimersByTime(1000)
  expect(changes).toEqual([true, false])
  expect(then).not.toHaveBeenCalled()

  gate.start()
  gate.cancel()
  vi.advanceTimersByTime(1000)
  expect(changes).toEqual([true, false])
})
