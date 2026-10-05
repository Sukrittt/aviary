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
})
