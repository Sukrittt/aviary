import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Playground } from './Playground'
// Playground import()s the phone screen once visible. Load it up front so the
// dynamic import resolves before the fake timers start driving the demo.
import './mobile/LogExpense'

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
  // The category sheet measures itself.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const run = async (ms: number) => {
  for (let t = 0; t < ms; t += 50) await act(async () => { await vi.advanceTimersByTimeAsync(50) })
}

describe('log playground', () => {
  it('plays itself until someone takes over: types, picks a category, enters the amount and logs it, silently', async () => {
    vi.useFakeTimers()
    render(<Playground />)
    await run(4800)
    expect(screen.getByDisplayValue('Coffee with Sam')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Category: Snacks' })).toBeInTheDocument()
    await run(4500)
    expect(screen.getByText('Added')).toBeInTheDocument()
    expect(play).not.toHaveBeenCalled()
  })

  it('files a logged chai under Snacks with the same balance the lesson shows', async () => {
    vi.useFakeTimers()
    const { container } = render(<Playground />)
    fireEvent.click(screen.getByRole('button', { name: 'Try it yourself' }))
    await run(600)
    fireEvent.click(screen.getByRole('button', { name: 'Chai' }))
    await run(3000)
    expect(screen.getByRole('button', { name: 'Category: Snacks' })).toBeInTheDocument()

    for (const k of ['2', '0']) fireEvent.click(container.querySelector(`button.m-key[aria-label="${k}"]`)!)
    fireEvent.click(screen.getByRole('button', { name: 'Log expense' }))
    await run(2500)
    expect(screen.getByText('Added')).toBeInTheDocument()
    expect(screen.getByText('left of ₹600')).toBeInTheDocument()
    await run(2500) // the balance rolls down on its own beat
    expect(screen.getByLabelText('₹220')).toBeInTheDocument()
  })

  it('opens the category picker when + is hit without one, and logs once it’s picked', async () => {
    vi.useFakeTimers()
    const { container } = render(<Playground />)
    fireEvent.click(screen.getByRole('button', { name: 'Try it yourself' }))
    await run(600)
    for (const k of ['5', '0']) fireEvent.click([...container.querySelectorAll(`button.m-key[aria-label="${k}"]`)].at(-1)!)

    fireEvent.click(screen.getByRole('button', { name: 'Log expense' }))
    await run(400)
    expect(screen.getByText('Choose a category')).toBeInTheDocument()
    expect(screen.queryByText('Added')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /Outings/ }).at(-1)!)
    await run(2500)
    expect(screen.getByText('Added')).toBeInTheDocument()
  })

  it('still logs when the pick matches the category auto-suggest landed while the picker was open', async () => {
    vi.useFakeTimers()
    const { container } = render(<Playground />)
    fireEvent.click(screen.getByRole('button', { name: 'Try it yourself' }))
    await run(600)
    fireEvent.click(screen.getByRole('button', { name: 'Netflix' }))
    await run(700) // typed, but the suggestion hasn't landed yet
    expect(screen.getAllByRole('button', { name: 'Category' }).at(-1)).toHaveTextContent('Pick a category')
    for (const k of ['5', '0']) fireEvent.click([...container.querySelectorAll(`button.m-key[aria-label="${k}"]`)].at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: 'Log expense' }))
    await run(3000) // the suggestion lands under the open picker
    fireEvent.click(screen.getAllByRole('button', { name: /Subscriptions/ }).at(-1)!)
    await run(2500)
    expect(screen.getByText('Added')).toBeInTheDocument()
  })
})
