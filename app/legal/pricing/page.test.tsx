import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlanPrices } from '@/lib/billing/razorpay'
import PricingPage from './page'

vi.mock('@/lib/billing/razorpay', () => ({ getPlanPrices: vi.fn() }))

const prices = [
  { period: 'monthly' as const, amount: 19900, currency: 'INR' },
  { period: 'yearly' as const, amount: 199900, currency: 'INR' },
]

beforeEach(() => {
  vi.mocked(getPlanPrices).mockReset()
})

describe('public pricing', () => {
  it('shows provider prices, billing periods and calculated annual savings in named cards', async () => {
    vi.mocked(getPlanPrices).mockResolvedValue(prices)
    render(await PricingPage())

    expect(within(screen.getByRole('region', { name: 'Monthly' })).getByText('₹199')).toBeInTheDocument()
    const yearly = within(screen.getByRole('region', { name: 'Yearly' }))
    expect(yearly.getByText('₹1,999')).toBeInTheDocument()
    expect(yearly.getByText('Save 16%')).toBeInTheDocument()
    expect(yearly.getByText('/ year')).toBeInTheDocument()
  })

  it('does not advertise savings when annual billing costs more', async () => {
    vi.mocked(getPlanPrices).mockResolvedValue([prices[0], { ...prices[1], amount: 250000 }])
    render(await PricingPage())

    expect(screen.queryByText(/Save \d+%/)).not.toBeInTheDocument()
    expect(screen.getByText('₹2,500')).toBeInTheDocument()
  })

  it.each(['unconfigured', 'unreachable', 'incomplete'])('keeps pricing honest when the provider is %s', async (state) => {
    if (state === 'unreachable') vi.mocked(getPlanPrices).mockRejectedValue(new Error('Unavailable'))
    else vi.mocked(getPlanPrices).mockResolvedValue(state === 'incomplete' ? [prices[0]] : null)
    render(await PricingPage())

    expect(screen.getByText(/Prices aren't loading right now/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Monthly' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'refund and cancellation policy' })).toHaveAttribute('href', '/legal/refunds')
  })
})
