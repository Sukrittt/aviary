import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { BirdMark } from '../../components/BirdMark'
import { FLIGHT_TIMELINE } from './flight'
import { markSignInFlight } from './pending'
import { SignInFlight } from './SignInFlight'

// jsdom lays nothing out, so give the logo a size to count as visible.
function Page() {
  return (
    <>
      <BirdMark size={34} flightTarget />
      <SignInFlight />
    </>
  )
}

let frames: FrameRequestCallback[] = []
const runFrame = (now: number) => {
  const pending = frames
  frames = []
  act(() => pending.forEach((cb) => cb(now)))
}

beforeEach(() => {
  sessionStorage.clear()
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue(
    { left: 20, top: 20, width: 34, height: 34, right: 54, bottom: 54, x: 20, y: 20, toJSON() {} } as DOMRect,
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SignInFlight', () => {
  it('stays out of the way on an ordinary visit', () => {
    render(<Page />)
    expect(screen.queryByTestId('sign-in-flight')).toBeNull()
  })

  it('skips the flight under reduced motion, and still uses up the flag', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    markSignInFlight()
    render(<Page />)
    expect(screen.queryByTestId('sign-in-flight')).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it('flies once after sign-in, hiding the perched bird until it lands', () => {
    markSignInFlight()
    const { container } = render(<Page />)
    expect(screen.getByTestId('sign-in-flight')).toBeTruthy()
    const perched = container.querySelector<SVGGElement>('svg[data-flight-target] [data-bird]')!

    runFrame(1) // first frame sets the clock
    runFrame(1 + FLIGHT_TIMELINE.popEnd)
    expect(perched.style.opacity).toBe('0')

    runFrame(1 + FLIGHT_TIMELINE.land + 50)
    expect(perched.style.opacity).toBe('1')

    runFrame(1 + FLIGHT_TIMELINE.end)
    expect(screen.queryByTestId('sign-in-flight')).toBeNull()
    expect(perched.getAttribute('style')).toBeNull() // logo left exactly as it was
  })
})
