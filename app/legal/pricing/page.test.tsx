import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlanPrices } from '@/lib/billing/razorpay'
import PricingPage from './page'

vi.mock('@/lib/billing/razorpay', () => ({ getPlanPrices: vi.fn() }))
let paypalOn = false
const paypalPricesMock = vi.fn()
vi.mock('@/lib/billing/paypal', () => ({ paypalConfig: () => (paypalOn ? {} : null), getPayPalPlanPrices: () => paypalPricesMock() }))
let country: string | null = null
vi.mock('next/headers', () => ({ headers: async () => new Headers(country ? { 'x-vercel-ip-country': country } : {}) }))

const prices = [
  { period: 'monthly' as const, amount: 19900, currency: 'INR' },
  { period: 'yearly' as const, amount: 199900, currency: 'INR' },
]

beforeEach(() => {
  vi.mocked(getPlanPrices).mockReset()
  country = null
  paypalOn = false
})

describe('public pricing', () => {
  it('shows provider prices, billing periods and calculated annual savings in named cards', async () => {
    vi.mocked(getPlanPrices).mockResolvedValue(prices)
    render(await PricingPage())

    const monthly = within(screen.getByRole('region', { name: 'Monthly' }))
    expect(monthly.getByText('₹199')).toBeInTheDocument()
    expect(monthly.getByText('About ₹7 a day.')).toBeInTheDocument()
    const yearly = within(screen.getByRole('region', { name: 'Yearly' }))
    expect(yearly.getByText('₹1,999')).toBeInTheDocument()
    expect(yearly.getByText('Save 16%')).toBeInTheDocument()
    expect(yearly.getByText('/ year')).toBeInTheDocument()
    expect(yearly.getByText('Works out to ₹167 a month.')).toBeInTheDocument()
  })

  it('shows USD prices to visitors outside India, without asking Razorpay', async () => {
    country = 'US'
    render(await PricingPage())

    const monthly = within(screen.getByRole('region', { name: 'Monthly' }))
    expect(monthly.getByText('$4.90')).toBeInTheDocument()
    expect(monthly.getByText('About $0.16 a day.')).toBeInTheDocument()
    const yearly = within(screen.getByRole('region', { name: 'Yearly' }))
    expect(yearly.getByText('$49')).toBeInTheDocument()
    expect(yearly.getByText('Save 16%')).toBeInTheDocument()
    expect(yearly.getByText('Works out to $4.08 a month.')).toBeInTheDocument()
    expect(getPlanPrices).not.toHaveBeenCalled()
  })

  it('shows INR prices to visitors in India', async () => {
    country = 'IN'
    vi.mocked(getPlanPrices).mockResolvedValue(prices)
    render(await PricingPage())

    expect(screen.getByText('₹199')).toBeInTheDocument()
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

  it('wears the landing page’s shell: header home link, store CTA, what’s included, FAQ and footer', async () => {
    vi.mocked(getPlanPrices).mockResolvedValue(prices)
    render(await PricingPage())

    expect(screen.getByRole('link', { name: 'Aviary home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /Start your free trial/ })).toHaveAttribute('href', expect.stringContaining('play.google.com'))
    expect(screen.getByRole('heading', { name: 'Everything’s included.' })).toBeInTheDocument()
    expect(screen.getByText('Money Brain')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /What happens when my trial ends\?/ })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeInTheDocument()
  })

  it("shows PayPal's own prices and checkout to visitors outside India once PayPal is set up", async () => {
    country = 'GB'
    paypalOn = true
    paypalPricesMock.mockResolvedValue([
      { period: 'monthly', amount: 590, currency: 'USD' },
      { period: 'yearly', amount: 5900, currency: 'USD' },
    ])
    render(await PricingPage())
    expect(within(screen.getByRole('region', { name: 'Monthly' })).getByText('$5.90')).toBeInTheDocument()
    expect(screen.getByText(/PayPal or a card, through PayPal/)).toBeInTheDocument()
    expect(getPlanPrices).not.toHaveBeenCalled()
  })
})
