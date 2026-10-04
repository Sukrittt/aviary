import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const useBillingStatusMock = vi.fn()
const cancelMutate = vi.fn()
vi.mock('@/src/hooks/useBillingStatus', () => ({
  useBillingStatus: () => useBillingStatusMock(),
  useSyncBilling: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useCancelWebSubscription: () => ({ mutate: cancelMutate, isPending: false, isError: false }),
}))
vi.mock('./WebPlanPicker', () => ({ WebPlanPicker: () => <div>plan picker</div> }))

const { SubscriptionSection } = await import('./SubscriptionSection')

const base = {
  mode: 'paid',
  allowed: true,
  enforced: true,
  trialStartedAt: null,
  trialEndsAt: null,
  trialDaysRemaining: 0,
  productId: 'plan_year',
  basePlanId: 'yearly',
  paidExpiresAt: '2027-09-01T00:00:00.000Z',
  autoRenew: true,
  renewalState: 'active',
  retentionDeadline: null,
  purchaseEnabled: true,
  store: 'web',
}

const renderWith = (over: Record<string, unknown>) => {
  useBillingStatusMock.mockReturnValue({ data: { ...base, ...over }, isLoading: false })
  return render(<SubscriptionSection />)
}

beforeEach(() => vi.clearAllMocks())

describe('SubscriptionSection', () => {
  it('lets a web subscriber cancel here, and never sends them to Google Play', () => {
    renderWith({})
    expect(screen.queryByText('Manage in Google Play')).toBeNull()
    fireEvent.click(screen.getByText('Cancel renewal'))
    // The confirm dialog opens; confirming is what calls the API.
    expect(cancelMutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByText('Cancel renewal').at(-1)!)
    expect(cancelMutate).toHaveBeenCalled()
  })

  it('tells a web subscriber who already cancelled when access ends', () => {
    renderWith({ autoRenew: false, renewalState: 'cancelled' })
    expect(screen.getByText('Renewal is off')).toBeTruthy()
    expect(screen.queryByText('Cancel renewal')).toBeNull()
  })

  it('lets someone who subscribed mid-trial cancel before the first charge', () => {
    renderWith({ renewalState: 'scheduled', trialDaysRemaining: 13, paidExpiresAt: '2026-10-17T12:00:00.000Z' })
    expect(screen.getByText('13 days left')).toBeTruthy()
    fireEvent.click(screen.getByText('Cancel subscription'))
    fireEvent.click(screen.getAllByText('Cancel subscription').at(-1)!)
    expect(cancelMutate).toHaveBeenCalled()
  })

  it('sends a Play subscriber to Google Play, with no cancel button that would do nothing', () => {
    renderWith({ store: 'play' })
    expect(screen.getByText('Manage in Google Play')).toBeTruthy()
    expect(screen.queryByText('Cancel renewal')).toBeNull()
  })

  it('offers the plan picker during the trial once purchases are open', () => {
    renderWith({ mode: 'trial', store: null, trialDaysRemaining: 10, renewalState: null })
    expect(screen.getByText('plan picker')).toBeTruthy()
  })

  it("doesn't offer plans to someone already paying", () => {
    renderWith({ store: 'play' })
    expect(screen.queryByText('plan picker')).toBeNull()
  })
})
