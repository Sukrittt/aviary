import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { identifyUser, initAnalytics, resetAnalytics } from '@/src/lib/analytics'
import { AnalyticsProvider } from './AnalyticsProvider'

vi.mock('@workos-inc/authkit-nextjs/components', () => ({ useAuth: vi.fn() }))
vi.mock('@/src/lib/analytics', () => ({ identifyUser: vi.fn(), initAnalytics: vi.fn(), resetAnalytics: vi.fn() }))

const signedInAs = (user: object | null) => vi.mocked(useAuth).mockReturnValue({ user } as unknown as ReturnType<typeof useAuth>)

describe('AnalyticsProvider', () => {
  beforeEach(() => vi.clearAllMocks())

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
})
