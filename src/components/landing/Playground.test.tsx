import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Playground } from './Playground'

vi.mock('@lottiefiles/dotlottie-react', () => ({ DotLottieReact: () => null }))

const play = vi.fn(() => Promise.resolve())
const vibrate = vi.fn()

beforeEach(() => {
  play.mockClear()
  vibrate.mockClear()
  vi.stubGlobal('Audio', class { play = play })
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
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

const run = async (ms: number) => {
  for (let t = 0; t < ms; t += 50) await act(async () => { await vi.advanceTimersByTimeAsync(50) })
}
const field = () => screen.getAllByPlaceholderText('What was it for?').at(-1)!

describe('log playground', () => {
  it('plays itself until someone takes over: types, picks a category, enters the amount and logs it, silently', async () => {
    vi.useFakeTimers()
    render(<Playground />)
    await run(4800)
    expect(screen.getByDisplayValue('Coffee with Sam')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Category: Outings' })).toBeInTheDocument()
    await run(4500)
    expect(screen.getByText('Added')).toBeInTheDocument()
    expect(play).not.toHaveBeenCalled()
  })

  it('starts the take over on a clean screen after a pause', async () => {
    vi.useFakeTimers()
    render(<Playground />)
    await run(2500)
    fireEvent.click(screen.getByRole('button', { name: 'Pause the demo' }))
    await run(1000)
    expect(field()).toHaveValue('')
  })

  it('hands the phone over on a tap, and a real log chimes and buzzes', async () => {
    vi.useFakeTimers()
    const { container } = render(<Playground />)
    await run(2500) // mid-take: the demo has started typing
    fireEvent.click(screen.getByRole('button', { name: 'Try it yourself' }))
    await run(600)
    expect(field()).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Pause the demo' })).not.toBeInTheDocument()

    // The demo is off for good: nothing types itself in.
    await run(3000)
    expect(field()).toHaveValue('')

    fireEvent.click(screen.getByRole('button', { name: 'Uber home' }))
    await run(3000)
    expect(field()).toHaveValue('Uber home')
    expect(screen.getByRole('button', { name: 'Category: Travel' })).toBeInTheDocument()

    for (const k of ['2', '4', '0']) fireEvent.click(container.querySelector(`button.m-key[aria-label="${k}"]`)!)
    fireEvent.click(screen.getByRole('tab', { name: 'Log expense' }))
    await run(2500)
    expect(screen.getByText('Added')).toBeInTheDocument()
    expect(play).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await run(600)
    expect(field()).toHaveValue('')
  })
})
