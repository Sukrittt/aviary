import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RollingAmount } from './RollingAmount'

const motion = vi.hoisted(() => ({ inView: false, reduce: false, rolls: 0 }))
vi.mock('motion/react', () => ({
  useInView: () => motion.inView,
  useReducedMotion: () => motion.reduce,
  // Jump straight to the end of the count.
  animate: (_from: number, to: number, opts: { onUpdate: (n: number) => void; onComplete: () => void }) => {
    motion.rolls++
    opts.onUpdate(to)
    opts.onComplete()
    return { stop: () => {} }
  },
}))

const money = (n: number) => `₹${n}`
const amount = (play: number) => <RollingAmount from={1000} to={3050} play={play} format={money} className="env2-pill" />

beforeEach(() => {
  motion.inView = false
  motion.reduce = false
  motion.rolls = 0
})

describe('RollingAmount', () => {
  it('just shows the amount when not playing', () => {
    render(amount(0))
    expect(screen.getByText('₹3050')).toBeInTheDocument()
    expect(motion.rolls).toBe(0)
  })

  it('holds the old amount until it scrolls into view, then counts in and splashes', () => {
    const { rerender } = render(amount(1))
    expect(screen.getByText('₹1000')).toBeInTheDocument()
    expect(motion.rolls).toBe(0)

    motion.inView = true
    rerender(amount(1))
    const pill = screen.getByText('₹3050')
    expect(pill).toHaveClass('is-splash')
    expect(motion.rolls).toBe(1)
  })

  it('plays again on the next play, not on every render', () => {
    motion.inView = true
    const { rerender } = render(amount(1))
    rerender(amount(1))
    expect(motion.rolls).toBe(1)
    act(() => rerender(amount(2)))
    expect(motion.rolls).toBe(2)
  })

  it('skips the roll for reduced motion', () => {
    motion.reduce = true
    motion.inView = true
    render(amount(1))
    expect(screen.getByText('₹3050')).toBeInTheDocument()
    expect(motion.rolls).toBe(0)
  })
})
