import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { analyticsReady, isAnalyticsLoading, track } from '../lib/analytics'
import { TrackedLink } from './TrackedLink'

vi.mock('../lib/analytics', () => ({ track: vi.fn(), isAnalyticsLoading: vi.fn(), analyticsReady: vi.fn() }))

const assign = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('location', { ...window.location, assign })
})

const renderLink = () => render(<TrackedLink href="https://example.com/store" event="store_cta_clicked">Get it</TrackedLink>)

describe('TrackedLink', () => {
  it('navigates natively once analytics is loaded', () => {
    vi.mocked(isAnalyticsLoading).mockReturnValue(false)
    renderLink()
    const allowed = fireEvent.click(screen.getByText('Get it'))
    expect(track).toHaveBeenCalledWith('store_cta_clicked', undefined)
    expect(allowed).toBe(true)
  })

  it('holds a click made while analytics loads, then navigates once it is ready', async () => {
    vi.mocked(isAnalyticsLoading).mockReturnValue(true)
    let ready: () => void = () => {}
    vi.mocked(analyticsReady).mockReturnValue(new Promise<void>((r) => { ready = r }))
    renderLink()
    const allowed = fireEvent.click(screen.getByText('Get it'))
    expect(allowed).toBe(false)
    expect(assign).not.toHaveBeenCalled()
    ready()
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://example.com/store'))
  })

  it('lets a modified click through, since it opens a new tab', () => {
    vi.mocked(isAnalyticsLoading).mockReturnValue(true)
    renderLink()
    expect(fireEvent.click(screen.getByText('Get it'), { metaKey: true })).toBe(true)
  })

  it('disables sign-in immediately and ignores repeated clicks while analytics loads', () => {
    vi.mocked(isAnalyticsLoading).mockReturnValue(true)
    vi.mocked(analyticsReady).mockReturnValue(new Promise<void>(() => {}))
    render(<TrackedLink href="/api/auth/google" event="sign_in_started" disableOnClick>Continue with Google</TrackedLink>)
    const link = screen.getByRole('link', { name: 'Continue with Google' })
    fireEvent.click(link)
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(link).toHaveAttribute('aria-busy', 'true')
    expect(fireEvent.click(link)).toBe(false)
    expect(track).toHaveBeenCalledTimes(1)
  })

  it('keeps sign-in available when a modified click opens another tab', () => {
    render(<TrackedLink href="/api/auth/google" event="sign_in_started" disableOnClick>Continue with Google</TrackedLink>)
    const link = screen.getByRole('link', { name: 'Continue with Google' })
    expect(fireEvent.click(link, { metaKey: true })).toBe(true)
    expect(link).not.toHaveAttribute('aria-disabled')
  })

  it('reenables sign-in when returning through browser history', () => {
    vi.mocked(isAnalyticsLoading).mockReturnValue(false)
    render(<TrackedLink href="/api/auth/google" event="sign_in_started" disableOnClick>Continue with Google</TrackedLink>)
    const link = screen.getByRole('link', { name: 'Continue with Google' })
    fireEvent.click(link)
    fireEvent(window, new Event('pageshow'))
    expect(link).not.toHaveAttribute('aria-disabled')
  })
})
