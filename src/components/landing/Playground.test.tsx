import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Playground } from './Playground'

vi.mock('@lottiefiles/dotlottie-react', () => ({ DotLottieReact: () => null }))

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

const run = async (ms: number) => {
  for (let t = 0; t < ms; t += 50) await act(async () => { await vi.advanceTimersByTimeAsync(50) })
}

describe('self-playing log demo', () => {
  it('types, picks a category, enters the amount and logs it', async () => {
    vi.useFakeTimers()
    render(<Playground />)
    await run(4800)
    expect(screen.getByDisplayValue('Coffee with Sam')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Category: Outings' })).toBeInTheDocument()
    await run(4500)
    expect(screen.getByText('Added')).toBeInTheDocument()
  })

  it('starts the take over on a clean screen after a pause', async () => {
    vi.useFakeTimers()
    render(<Playground />)
    await run(2500)
    fireEvent.click(screen.getByRole('button', { name: 'Pause the demo' }))
    await run(1000)
    const fields = screen.getAllByPlaceholderText('What was it for?')
    expect(fields.at(-1)).toHaveValue('')
  })
})
