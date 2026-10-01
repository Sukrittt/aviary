import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const plansMock = vi.fn()
const checkoutMock = vi.fn()
vi.mock('@/src/hooks/useBillingStatus', () => ({
  useWebPlans: () => plansMock(),
  useWebCheckout: () => checkoutMock(),
}))
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
  it('shows both live prices and the yearly saving, with yearly picked by default', () => {
    render(<WebPlanPicker />)
    expect(screen.getByText('Save 15%')).toBeTruthy()
    fireEvent.click(screen.getByText('Subscribe for ₹999'))
    expect(mutate).toHaveBeenCalledWith('yearly')
  })

  it('buys the plan the user picked', () => {
    render(<WebPlanPicker />)
    fireEvent.click(screen.getByText('Monthly'))
    fireEvent.click(screen.getByText('Subscribe for ₹99'))
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
