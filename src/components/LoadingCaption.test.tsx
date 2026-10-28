import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoadingCaption } from './LoadingCaption'

describe('LoadingCaption', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('cycles ordered feature phrases on the mobile cadence', () => {
    vi.useFakeTimers()
    render(<LoadingCaption feature="recurring" />)

    expect(screen.getByText('Checking what repeats…')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1799))
    expect(screen.getByText('Checking what repeats…')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByText('Reading the calendar…')).toBeTruthy()
  })

  it('renders an accessible stable status and no timer for one phrase', () => {
    vi.useFakeTimers()
    const timer = vi.spyOn(globalThis, 'setInterval')
    render(<LoadingCaption phrases={['Almost there…']} ordered />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.getByText('Almost there…').parentElement).toHaveAttribute('aria-hidden', 'true')
    expect(timer).not.toHaveBeenCalled()
  })

  it('runs the shimmer across the phrase while it waits', () => {
    render(<LoadingCaption phrases={['Almost there…']} ordered />)
    expect(screen.getByText('Almost there…')).toHaveClass('text-shimmer')
  })
})
