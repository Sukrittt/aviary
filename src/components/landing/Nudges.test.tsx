import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeroStage, NoticeSplit } from './Nudges'

let now = 0
beforeEach(() => {
  now = 0
  vi.stubGlobal('Audio', class { play() { return Promise.resolve() } })
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private cb: IntersectionObserverCallback) {}
    observe() { this.cb([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
    disconnect() {}
  })
  // Drive the hero's rAF clock by hand.
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(now), 16) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const advance = (ms: number) => act(() => { for (let t = 0; t < ms; t += 16) { now += 16; vi.advanceTimersByTime(16) } })

describe('landing demos', () => {
  it('hero answers the nudge, then moves on to the next chapter; pause holds it', () => {
    vi.useFakeTimers()
    const { container } = render(<HeroStage />)
    const stage = container.querySelector('.lp-stage')!
    expect(stage).toHaveAttribute('data-chapter', 'learns')
    advance(5000)
    expect(stage).toHaveAttribute('data-step', '3')
    expect(stage).toHaveTextContent('Logged ₹20')
    advance(4200)
    expect(stage).toHaveAttribute('data-chapter', 'scan')

    fireEvent.click(screen.getByRole('button', { name: 'Pause the demo' }))
    advance(20_000)
    expect(stage).toHaveAttribute('data-chapter', 'scan')

    fireEvent.click(screen.getByRole('button', { name: /Ask Aviary/ }))
    expect(stage).toHaveAttribute('data-chapter', 'ask')
  })

  it('split runs its steps once in view, then replays', () => {
    vi.useFakeTimers()
    const { container } = render(<NoticeSplit />)
    expect(container).toHaveTextContent('Aviary is on it')
    for (let i = 0; i < 40; i++) act(() => { vi.advanceTimersByTime(150) })
    expect(container).toHaveTextContent('Aviary is done')
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    expect(container).toHaveTextContent('Aviary is on it')
  })
})
