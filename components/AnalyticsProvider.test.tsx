import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { identifyUser, initAnalytics, resetAnalytics, track } from '@/src/lib/analytics'
import { AnalyticsProvider } from './AnalyticsProvider'

vi.mock('@workos-inc/authkit-nextjs/components', () => ({ useAuth: vi.fn() }))
vi.mock('@/src/lib/analytics', async (importOriginal) => ({
  SIGN_IN_OUTCOME_COOKIE: (await importOriginal<typeof import('@/src/lib/analytics')>()).SIGN_IN_OUTCOME_COOKIE,
  identifyUser: vi.fn(), initAnalytics: vi.fn(() => Promise.resolve()), resetAnalytics: vi.fn(), track: vi.fn(),
}))

const signedInAs = (user: object | null) => vi.mocked(useAuth).mockReturnValue({ user } as unknown as ReturnType<typeof useAuth>)

describe('AnalyticsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(initAnalytics).mockImplementation(() => Promise.resolve())
  })

  it('starts analytics and leaves a signed-out visitor anonymous', () => {
    signedInAs(null)
    render(<AnalyticsProvider><div /></AnalyticsProvider>)
    expect(initAnalytics).toHaveBeenCalledTimes(1)
    expect(identifyUser).not.toHaveBeenCalled()
    expect(resetAnalytics).not.toHaveBeenCalled()
  })

  it('identifies a signed-in user once, then resets on sign-out', () => {
    signedInAs({ id: 'user_1', email: 'a@b.com', firstName: 'Ada', lastName: 'Lovelace' })
    const { rerender } = render(<AnalyticsProvider><div /></AnalyticsProvider>)
    rerender(<AnalyticsProvider><div /></AnalyticsProvider>)
    expect(identifyUser).toHaveBeenCalledTimes(1)
    expect(identifyUser).toHaveBeenCalledWith({ id: 'user_1', email: 'a@b.com', name: 'Ada Lovelace' })

    signedInAs(null)
    rerender(<AnalyticsProvider><div /></AnalyticsProvider>)
    expect(resetAnalytics).toHaveBeenCalledTimes(1)
  })

  it('reports a Google sign-in the server finished, once', async () => {
    document.cookie = 'sign_in_outcome=completed; path=/'
    signedInAs({ id: 'user_1' })
    const { rerender } = render(<AnalyticsProvider><div /></AnalyticsProvider>)
    rerender(<AnalyticsProvider><div /></AnalyticsProvider>)
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1))
    expect(track).toHaveBeenCalledWith('sign_in_completed', { method: 'google' })
    expect(document.cookie).not.toContain('sign_in_outcome')
  })

  // The outcome must survive until PostHog is up to send it: a page left
  // before then retries on the next one instead of losing the event.
  it('keeps the outcome until analytics has loaded', async () => {
    document.cookie = 'sign_in_outcome=completed; path=/'
    let loaded!: () => void
    vi.mocked(initAnalytics).mockImplementation(() => new Promise<void>((resolve) => { loaded = resolve }))
    signedInAs({ id: 'user_1' })
    render(<AnalyticsProvider><div /></AnalyticsProvider>)
    expect(document.cookie).toContain('sign_in_outcome=completed')
    expect(track).not.toHaveBeenCalled()
    loaded()
    await waitFor(() => expect(track).toHaveBeenCalledWith('sign_in_completed', { method: 'google' }))
    expect(document.cookie).not.toContain('sign_in_outcome')
  })

  it('reports a failed Google sign-in with its reason', async () => {
    document.cookie = 'sign_in_outcome=token_exchange_failed; path=/'
    signedInAs(null)
    render(<AnalyticsProvider><div /></AnalyticsProvider>)
    await waitFor(() => expect(track).toHaveBeenCalledWith('sign_in_failed', { method: 'google', reason: 'token_exchange_failed' }))
  })

  it('reports nothing without an outcome', async () => {
    signedInAs({ id: 'user_1' })
    render(<AnalyticsProvider><div /></AnalyticsProvider>)
    await Promise.resolve()
    expect(track).not.toHaveBeenCalled()
  })
})
