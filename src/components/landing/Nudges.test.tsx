import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeroStage, TickButton } from './Nudges'

beforeEach(() => {
  vi.stubGlobal('Audio', class { play() { return Promise.resolve() } })
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private cb: IntersectionObserverCallback) {}
    observe() { this.cb([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
    disconnect() {}
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('landing nudge demos', () => {
  it('tick button logs, then resets after the success beat', () => {
    vi.useFakeTimers()
    render(<TickButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Log ₹20' }))
    expect(screen.getByRole('button', { name: 'Logged' })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1100) })
    expect(screen.getByRole('button', { name: 'Log ₹20' })).toBeInTheDocument()
  })

  it('hero loop answers the nudge and updates the envelope, and pause stops it', () => {
    vi.useFakeTimers()
    const { container } = render(<HeroStage />)
    const stage = container.querySelector('.lp-stage')!
    expect(stage).toHaveAttribute('data-step', '0')
    act(() => { vi.advanceTimersByTime(1400) })
    act(() => { vi.advanceTimersByTime(2600) })
    act(() => { vi.advanceTimersByTime(700) })
    expect(stage).toHaveAttribute('data-step', '3')
    expect(stage).toHaveTextContent('Logged ₹20')
    expect(stage).toHaveTextContent('₹220')

    fireEvent.click(screen.getByRole('button', { name: 'Pause the demo' }))
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(stage).toHaveAttribute('data-step', '3')
  })
})
