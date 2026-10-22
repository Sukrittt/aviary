import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RollingAmount, rollSteps } from './RollingAmount'

const motion = vi.hoisted(() => ({ inView: false, reduce: false }))
vi.mock('motion/react', async (orig) => ({
  ...(await orig<typeof import('motion/react')>()),
  useInView: () => motion.inView,
  useReducedMotion: () => motion.reduce,
}))
vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ formatCurrency: (n: number) => `₹${n}` }) }))

const money = (n: number) => `₹${n}`
const amount = (play: number, from = 1000, to = 3050) => <RollingAmount from={from} to={to} play={play} format={money} className="env2-pill" />
const pill = (c: HTMLElement) => c.querySelector('.env2-pill')!
// The odometer keeps the rolling digit's old glyph in the DOM (clipped), so read the label.
const label = (c: HTMLElement) => pill(c).querySelector('[aria-label]')!.getAttribute('aria-label')

beforeEach(() => {
  motion.inView = false
  motion.reduce = false
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('rollSteps', () => {
  it('eases out and always lands exactly on the new amount', () => {
    const steps = rollSteps(1000, 3050)
    expect(steps).toHaveLength(5)
    expect(steps.at(-1)).toBe(3050)
    expect(steps[0] - 1000).toBeGreaterThan(steps[4] - steps[3])
    expect(rollSteps(8000, 7450).every((n) => n <= 8000 && n >= 7450)).toBe(true)
  })
})

describe('RollingAmount', () => {
  it('just shows the amount when not playing', () => {
    const { container } = render(amount(0))
    expect(label(container)).toBe('₹3050')
  })

  it('holds the old amount until on screen, then ticks in, bounces and splashes', () => {
    const { container, rerender } = render(amount(1))
    act(() => vi.advanceTimersByTime(5000))
    expect(label(container)).toBe('₹1000')
    expect(pill(container)).toHaveClass('is-rolling-up')

    motion.inView = true
    rerender(amount(1))
    act(() => vi.advanceTimersByTime(500 + 300))
    expect(label(container)).not.toBe('₹1000')
    act(() => vi.advanceTimersByTime(300 * 4))
    expect(label(container)).toBe('₹3050')
    expect(pill(container)).toHaveClass('is-splash')
    expect(pill(container)).not.toHaveClass('is-rolling-up')
    expect(container.querySelectorAll('.env2-splash i').length).toBeGreaterThan(0)
    act(() => vi.advanceTimersByTime(1000))
    expect(container.querySelector('.env2-splash')).toBeNull()
  })

  it('is red while a shortfall counts down', () => {
    const { container } = render(amount(1, 8000, 7450))
    expect(label(container)).toBe('₹8000')
    expect(pill(container)).toHaveClass('is-rolling-down')
  })

  it('starts over from the old amount on the next play', () => {
    motion.inView = true
    const { container, rerender } = render(amount(1))
    act(() => vi.advanceTimersByTime(3000))
    expect(label(container)).toBe('₹3050')
    rerender(amount(2))
    expect(label(container)).toBe('₹1000')
  })

  it('skips the roll for reduced motion', () => {
    motion.reduce = true
    const { container } = render(amount(1))
    expect(label(container)).toBe('₹3050')
  })
})
