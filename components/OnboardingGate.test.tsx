import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnboardingGate } from './OnboardingGate'

let mockPathname = '/'
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace }),
}))

// Counts loader renders: act() flushes the effect that drops the loader, so a
// one-frame flash only shows up as a render here, never in the final DOM.
const loaderRenders = vi.fn()
vi.mock('@/src/components/LoadingCaption', () => ({
  LoadingCaption: () => {
    loaderRenders()
    return <p>loading</p>
  },
}))

const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(() => new Promise<Response>(() => {}))
  replace.mockClear()
  loaderRenders.mockClear()
  localStorage.clear()
  vi.stubGlobal('fetch', fetchMock)
})

describe('OnboardingGate', () => {
  it.each(['/legal/privacy', '/legal/terms', '/', '/intl', '/help', '/changelog', '/compare/goodbudget', '/tools/50-30-20-calculator', '/features/ask-aviary'])('renders public page %s straight away, without asking for the user', (path) => {
    mockPathname = path
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(screen.getByText('page')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // A 404 isn't part of the app: holding it behind the loader server-rendered the
  // loader instead of the 404, without the app styles it needs.
  it('renders an unknown path (a 404) straight away, without asking for the user', () => {
    mockPathname = '/no-such-page'
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(screen.getByText('page')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('checks on the first app page after a public one, without flashing it first', () => {
    mockPathname = '/help'
    const { rerender } = render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(fetchMock).not.toHaveBeenCalled()

    mockPathname = '/insights'
    rerender(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(screen.queryByText('page')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/user')
  })

  // The flash itself: coming from a public page the app sheets aren't loaded yet,
  // so the loader drew unstyled in the corner before the page replaced it.
  it.each(['/help', '/expense'])('goes from %s to an app page with no loader frame once this browser has seen the account onboarded', (from) => {
    mockPathname = from
    localStorage.setItem('aviary.onboarded', '1')
    const { rerender } = render(<OnboardingGate><p>page</p></OnboardingGate>)

    mockPathname = '/insights'
    rerender(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(screen.getByText('page')).toBeTruthy()
    expect(loaderRenders).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith('/api/user')
  })

  it.each(['/insights', '/investments', '/wrapped', '/account', '/account/income', '/admin', '/expense/transactions'])('holds app page %s until the onboarding check answers', (path) => {
    mockPathname = path
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(screen.queryByText('page')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/user')
  })

  it('holds an app page until the onboarding check answers', () => {
    mockPathname = '/insights'
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(screen.queryByText('page')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/user')
  })

  it('renders straight away for a browser that has seen this account onboarded, still checking in the background', async () => {
    mockPathname = '/insights'
    localStorage.setItem('aviary.onboarded', '1')
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(await screen.findByText('page')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/user')
  })

  it('remembers onboarding once the check confirms it', async () => {
    mockPathname = '/insights'
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ onboardedAt: '2026-01-01T00:00:00.000Z' })))
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(await screen.findByText('page')).toBeTruthy()
    expect(localStorage.getItem('aviary.onboarded')).toBe('1')
  })

  it('still sends a not-onboarded account to onboarding, and forgets the stale flag', async () => {
    mockPathname = '/insights'
    localStorage.setItem('aviary.onboarded', '1')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ onboardedAt: null })))
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'))
    expect(localStorage.getItem('aviary.onboarded')).toBeNull()
  })

  it.each(['/sign-in', '/email', '/code'])('forgets the flag on %s, so the next account to sign in gets a full check', (path) => {
    mockPathname = path
    localStorage.setItem('aviary.onboarded', '1')
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(localStorage.getItem('aviary.onboarded')).toBeNull()
  })

  it('leaves /expense to its server-side check, but still gates the routes under it', () => {
    mockPathname = '/expense'
    const { unmount } = render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(screen.getByText('page')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    unmount()

    mockPathname = '/expense/envelopes'
    render(<OnboardingGate><p>page</p></OnboardingGate>)
    expect(screen.queryByText('page')).toBeNull()
  })

  it('checks /expense after all when told to recheck (the server could not read the profile)', () => {
    mockPathname = '/expense'
    render(<OnboardingGate recheck><p>page</p></OnboardingGate>)
    expect(screen.queryByText('page')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/user')
  })
})
