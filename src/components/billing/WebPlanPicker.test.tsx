import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const plansMock = vi.fn()
const checkoutMock = vi.fn()
vi.mock('@/src/hooks/useBillingStatus', () => ({
  useWebPlans: () => plansMock(),
  useWebCheckout: () => checkoutMock(),
}))
const trackMock = vi.fn()
vi.mock('@/src/lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))
vi.mock('@/src/hooks/useUser', () => ({ useUser: () => ({ data: { email: 'a@b.com', name: 'A' } }) }))

const { WebPlanPicker } = await import('./WebPlanPicker')

const plans = [
  { period: 'monthly', amount: 9900, currency: 'INR' },
  { period: 'yearly', amount: 99900, currency: 'INR' },
]
const mutate = vi.fn()
const checkout = (over: Record<string, unknown> = {}) => checkoutMock.mockReturnValue({ mutate, isPending: false, isError: false, data: undefined, ...over })

beforeEach(() => {
  vi.clearAllMocks()
  plansMock.mockReturnValue({ data: plans, isLoading: false, isError: false })
  checkout()
})

describe('WebPlanPicker', () => {
  it('counts one paywall view once the plans are on screen, tagged with why it showed', () => {
    const { rerender } = render(<WebPlanPicker trigger="access_expired" />)
    rerender(<WebPlanPicker trigger="access_expired" />)
    expect(trackMock.mock.calls).toEqual([['paywall_viewed', { trigger: 'access_expired' }]])
  })

  it('counts no paywall view when the plans failed to load, even with stale ones cached', () => {
    plansMock.mockReturnValue({ data: plans, isLoading: false, isError: true })
    render(<WebPlanPicker />)
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('counts no paywall view while the plans are still loading', () => {
    plansMock.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<WebPlanPicker />)
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('shows both live prices and the yearly saving, with yearly picked by default', () => {
    render(<WebPlanPicker />)
    expect(screen.getByText('Save 15%')).toBeTruthy()
    fireEvent.click(screen.getByText('Subscribe yearly · ₹999'))
    expect(mutate).toHaveBeenCalledWith('yearly')
  })

  it('lists what the plan includes and the per-month cost of yearly', () => {
    render(<WebPlanPicker />)
    expect(screen.getByText('No ads. Ever.')).toBeTruthy()
    expect(screen.getByText('₹83.25/month, billed yearly')).toBeTruthy()
  })

  it('says nothing is charged until the trial ends when bought mid-trial', () => {
    render(<WebPlanPicker trialEndsAt={new Date(Date.now() + 12 * 86_400_000).toISOString()} />)
    expect(screen.getByText(/Nothing's charged until your trial ends/)).toBeTruthy()
  })

  it("doesn't promise a deferred charge in the trial's last minutes, when the server charges now", () => {
    render(<WebPlanPicker trialEndsAt={new Date(Date.now() + 10 * 60_000).toISOString()} />)
    expect(screen.queryByText(/Nothing's charged until your trial ends/)).toBeNull()
  })

  it('buys the plan the user picked', () => {
    render(<WebPlanPicker />)
    fireEvent.click(screen.getByText('Monthly'))
    fireEvent.click(screen.getByText('Subscribe monthly · ₹99'))
    expect(mutate).toHaveBeenCalledWith('monthly')
  })

  it("tells someone paid through Play there's nothing to buy", () => {
    checkout({ data: { status: 'already_subscribed', store: 'play' } })
    render(<WebPlanPicker />)
    expect(screen.getByText(/already got a plan through Google Play/)).toBeTruthy()
  })

  it("says not to pay twice when the payment couldn't be confirmed yet", () => {
    checkout({ data: { status: 'pending', access: {} } })
    render(<WebPlanPicker />)
    expect(screen.getByText(/No need to pay again/)).toBeTruthy()
  })

  it('never shows a raw error', () => {
    plansMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<WebPlanPicker />)
    expect(screen.getByText(/Check your connection and try again/)).toBeTruthy()
  })
})
