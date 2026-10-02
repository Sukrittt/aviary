import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Playground } from './Playground'

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private cb: IntersectionObserverCallback) {}
    observe() { this.cb([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
    disconnect() {}
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('log recording', () => {
  it('plays the recording while on screen and pauses on demand', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const { container } = render(<Playground />)
    expect(container.querySelector('video')).toHaveAttribute('src', '/landing/clip-log.mp4')
    expect(play).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Pause the demo' }))
    expect(pause).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play the demo' })).toBeInTheDocument()
  })
})
