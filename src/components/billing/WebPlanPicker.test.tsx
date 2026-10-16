import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const plansMock = vi.fn()
const checkoutMock = vi.fn()
vi.mock('@/src/hooks/useBillingStatus', () => ({
  useWebPlans: () => plansMock(),
  useWebCheckout: (...args: unknown[]) => checkoutMock(...args),
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
  plansMock.mockReturnValue({ data: { plans, provider: 'razorpay' }, isLoading: false, isError: false })
  checkout()
})

describe('WebPlanPicker', () => {
  it('counts one paywall view once the plans are on screen, tagged with why it showed', () => {
    const { rerender } = render(<WebPlanPicker trigger="access_expired" />)
    rerender(<WebPlanPicker trigger="access_expired" />)
    expect(trackMock.mock.calls).toEqual([['paywall_viewed', { trigger: 'access_expired' }]])
  })

  it('counts no paywall view when the plans failed to load, even with stale ones cached', () => {
    plansMock.mockReturnValue({ data: { plans, provider: 'razorpay' }, isLoading: false, isError: true })
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
    fireEvent.click(screen.getByText('Keep Aviary · ₹999/year'))
    expect(mutate).toHaveBeenCalledWith('yearly')
  })

  it('quotes yearly per month in whole rupees', () => {
    render(<WebPlanPicker />)
    expect(screen.getByText('₹83/month · billed once a year')).toBeTruthy()
  })

  it('walks a mid-trial buyer through the dates: today, the reminder a week out, the first charge', () => {
    const end = new Date(Date.now() + 20 * 86_400_000)
    const day = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
    render(<WebPlanPicker trialEndsAt={end.toISOString()} />)
    expect(screen.getByText('Try everything. Pay only if it sticks.')).toBeTruthy()
    expect(screen.getByText(/Your trial runs to .+\. Subscribe now and the first charge waits for that date\./)).toBeTruthy()
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText(day(new Date(end.getTime() - 7 * 86_400_000)))).toBeTruthy()
    expect(screen.getByText(day(end))).toBeTruthy()
    expect(screen.getByText(/refundable ₹5/)).toBeTruthy()
    expect(screen.getByText('UPI or card')).toBeTruthy()
    expect(screen.queryByText('Snap a bill')).toBeNull()
  })

  it('drops the reminder step once its date has passed', () => {
    render(<WebPlanPicker trialEndsAt={new Date(Date.now() + 3 * 86_400_000).toISOString()} />)
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.queryByText(/A heads up, one week out/)).toBeNull()
    expect(screen.getByText(/First charge/)).toBeTruthy()
  })

  it("doesn't mention Razorpay's ₹5 mandate charge on PayPal", () => {
    plansMock.mockReturnValue({ data: { plans, provider: 'paypal' }, isLoading: false, isError: false })
    render(<WebPlanPicker trialEndsAt={new Date(Date.now() + 12 * 86_400_000).toISOString()} />)
    expect(screen.getByText('Pick a plan. We set up autopay and nothing else moves.')).toBeTruthy()
    expect(screen.getByText('PayPal or card')).toBeTruthy()
    expect(screen.queryByText(/₹5/)).toBeNull()
  })

  it('shows what the plan keeps switched on once access has expired', () => {
    render(<WebPlanPicker trigger="access_expired" />)
    expect(screen.getByText('Keep your budget going')).toBeTruthy()
    for (const title of ['Snap a bill', 'Ask Aviary', 'Monthly Wrapped', 'Widgets + web']) expect(screen.getByText(title)).toBeTruthy()
    expect(screen.getByText('Export free, always')).toBeTruthy()
    expect(screen.queryByText('Today')).toBeNull()
  })

  it("doesn't promise a deferred charge in the trial's last minutes, when the server charges now", () => {
    render(<WebPlanPicker trialEndsAt={new Date(Date.now() + 10 * 60_000).toISOString()} />)
    expect(screen.queryByText(/first charge waits/)).toBeNull()
    expect(screen.getByText('Keep your budget going')).toBeTruthy()
  })

  it('buys the plan the user picked', () => {
    render(<WebPlanPicker />)
    fireEvent.click(screen.getByText('Monthly'))
    fireEvent.click(screen.getByText('Keep Aviary · ₹99/month'))
    expect(screen.getByText('Renews monthly until you cancel from your account page.')).toBeTruthy()
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

  it('checks out through PayPal for visitors the server routes there, and says so', () => {
    plansMock.mockReturnValue({ data: { plans: [{ period: 'monthly', amount: 499, currency: 'USD' }, { period: 'yearly', amount: 4999, currency: 'USD' }], provider: 'paypal' }, isLoading: false, isError: false })
    render(<WebPlanPicker />)
    expect(checkoutMock).toHaveBeenCalledWith(expect.anything(), 'paypal')
    expect(screen.getByText('Keep Aviary · $49.99/year')).toBeTruthy()
    expect(screen.queryByText(/UPI/)).toBeNull()
  })

  it('stays locked while the browser heads to PayPal', () => {
    plansMock.mockReturnValue({ data: { plans, provider: 'paypal' }, isLoading: false, isError: false })
    checkout({ data: { status: 'redirecting' } })
    render(<WebPlanPicker />)
    expect((screen.getByText('Taking you to PayPal…').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })
})
