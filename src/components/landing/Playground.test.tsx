import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Playground } from './Playground'
import { fitAmountSize } from './mobile/LogExpense'

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

    // Tabs this demo doesn't have say so.
    fireEvent.click(screen.getByRole('tab', { name: 'Categories' }))
    expect(screen.getByText(/This demo only logs/)).toBeInTheDocument()

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

  it('matches the app’s log screen: calculator with grouped numbers, optional name, + hint', async () => {
    vi.useFakeTimers()
    const { container } = render(<Playground />)
    fireEvent.click(screen.getByRole('button', { name: 'Try it yourself' }))
    await run(600)
    const key = (k: string) => fireEvent.click([...container.querySelectorAll(`button.m-key[aria-label="${k}"]`)].at(-1)!)

    // Calculator: the amount is the sum, the line under it the sum written out with commas.
    fireEvent.click(screen.getAllByRole('button', { name: 'Calculator' }).at(-1)!)
    for (const k of ['1', '2', '0', '0', '0', '+', '8']) key(k)
    expect(screen.getByText('12,000 + 8')).toBeInTheDocument()
    expect(screen.queryByTestId('nav-add-hint')).not.toBeInTheDocument()

    // No name needed: a category is enough, and + says it saves.
    fireEvent.click(screen.getAllByRole('button', { name: 'Category' }).at(-1)!)
    fireEvent.click(screen.getAllByRole('button', { name: /Outings/ }).at(-1)!)
    await run(400)
    expect(screen.getByText('Tap + to save')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Log expense' }))
    await run(2500)
    expect(screen.getByText('Added')).toBeInTheDocument()
  })

  it('opens the category picker when + is hit without one, and logs once it’s picked', async () => {
    vi.useFakeTimers()
    const { container } = render(<Playground />)
    fireEvent.click(screen.getByRole('button', { name: 'Try it yourself' }))
    await run(600)
    for (const k of ['5', '0']) fireEvent.click([...container.querySelectorAll(`button.m-key[aria-label="${k}"]`)].at(-1)!)

    fireEvent.click(screen.getByRole('tab', { name: 'Log expense' }))
    await run(400)
    expect(screen.getByText('Choose a category')).toBeInTheDocument()
    expect(screen.queryByText('Added')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /Outings/ }).at(-1)!)
    await run(2500)
    expect(screen.getByText('Added')).toBeInTheDocument()
  })

  it('has no chat icon in the header', async () => {
    render(<Playground />)
    expect(screen.queryByRole('button', { name: 'Log several spends at once' })).not.toBeInTheDocument()
  })
})

describe('fitAmountSize', () => {
  it('keeps a short amount at full size and shrinks a long one to fit the phone', () => {
    expect(fitAmountSize('₹1,200')).toBeCloseTo(56 * 1.3)
    // 328px of room: every glyph at ~0.62em has to fit.
    expect(fitAmountSize('₹99,99,99,999') * 0.62 * 13).toBeLessThanOrEqual(328)
  })
})
