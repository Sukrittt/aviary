import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const usePathnameMock = vi.fn(() => '/expense')
const replaceMock = vi.fn()
vi.mock('next/navigation', () => ({ usePathname: () => usePathnameMock(), useRouter: () => ({ replace: replaceMock }) }))

const useBillingStatusMock = vi.fn()
vi.mock('@/src/hooks/useBillingStatus', () => ({
  useBillingStatus: (enabled?: boolean) => useBillingStatusMock(enabled),
  useSyncBilling: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
}))

const { SubscriptionGate } = await import('./SubscriptionGate')

const app = <div>budgeting app</div>
const expired = { data: { allowed: false, mode: 'expired', renewalState: null, trialDaysRemaining: 0, retentionDeadline: null } }

function renderAt(pathname: string, status: unknown) {
  usePathnameMock.mockReturnValue(pathname)
  useBillingStatusMock.mockReturnValue(status)
  return render(<SubscriptionGate>{app}</SubscriptionGate>)
}

describe('SubscriptionGate', () => {
  it('replaces a budgeting screen when access has lapsed', () => {
    renderAt('/expense', expired)
    expect(screen.queryByText('budgeting app')).toBeNull()
    expect(screen.getByText('Subscription needed')).toBeTruthy()
  })

  it.each(['/account', '/account/recurring', '/account/archive', '/account/bill-scans'])(
    'locks %s too: the account hub and its budgeting features',
    (pathname) => {
      renderAt(pathname, expired)
      expect(screen.queryByText('budgeting app')).toBeNull()
      expect(screen.getByText('Subscription needed')).toBeTruthy()
    },
  )

  it.each(['/account/data', '/account/security', '/account/help', '/account/guided-tour', '/onboarding', '/', '/admin/system', '/legal/terms'])(
    'leaves %s reachable — these are the exit routes',
    (pathname) => {
      // An expired user has to be able to get their data out, manage their
      // account, and read the terms. Locking these would be holding their own
      // records hostage.
      renderAt(pathname, expired)
      expect(screen.getByText('budgeting app')).toBeTruthy()
    },
  )

  it('renders the app while the status is still unknown', () => {
    // Blocking on "unknown" flashes a paywall at paying users on every cold
    // load. The API enforces this independently, so guessing wrong here costs
    // a 402 on the data underneath, not a data leak.
    renderAt('/expense', { data: undefined })
    expect(screen.getByText('budgeting app')).toBeTruthy()
  })

  it('does not ask for billing status outside the app routes', () => {
    // This provider tree wraps the public landing page, where there is no
    // session and /api/billing/status answers 401 — one failing request, plus
    // a retry, for every anonymous visitor.
    renderAt('/', expired)
    expect(useBillingStatusMock).toHaveBeenCalledWith(false)
  })

  it('sends an account with no trial yet to onboarding, not the lock screen', () => {
    // setup_incomplete means onboarding never finished (e.g. the onboarding
    // check failed and let them through). There's no subscription to have
    // ended, so "Subscription needed" would be a lie.
    renderAt('/expense', { data: { ...expired.data, mode: 'setup_incomplete', trialEndsAt: null } })
    expect(screen.queryByText('Subscription needed')).toBeNull()
    expect(screen.queryByText('budgeting app')).toBeNull()
    expect(replaceMock).toHaveBeenCalledWith('/onboarding')
  })

  it('renders the app for an allowed account', () => {
    renderAt('/expense', { data: { ...expired.data, allowed: true, mode: 'trial', trialDaysRemaining: 30 } })
    expect(screen.getByText('budgeting app')).toBeTruthy()
  })

  it.each([
    ['no trial of their own', { allowed: false, mode: 'setup_incomplete' }],
    ['a lapsed plan of their own', { allowed: false, mode: 'expired' }],
  ])('keeps a shared budget open for a member with %s: the owner pays', (_, status) => {
    // A brand-new account that joins skips onboarding, so it has no trial. Sending
    // it to /onboarding bounced straight back to /expense, forever.
    replaceMock.mockClear()
    renderAt('/expense', { data: { ...expired.data, ...status, covered: true } })
    expect(screen.getByText('budgeting app')).toBeTruthy()
    expect(replaceMock).not.toHaveBeenCalled()
  })
})
