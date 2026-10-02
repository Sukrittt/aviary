import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

const DAY = 86400000
const now = Date.now()
const ago = (d: number) => new Date(now - d * DAY)

const rows: Record<string, unknown[]> = {}
const pricesMock = vi.fn()
const findMock = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/lib/billing/razorpay', () => ({ getPlanPrices: () => pricesMock() }))
vi.mock('@/lib/mongodb', () => ({
  getDb: async () => ({
    collection: (name: string) => ({
      find: (filter: Record<string, unknown> = {}) => {
        findMock(name, filter)
        const data = (rows[name] ?? []).filter(row => !filter.environment || (row as Record<string, unknown>).environment === filter.environment)
        const cursor = { sort: () => cursor, limit: (n: number) => ({ toArray: async () => data.slice(0, n) }), toArray: async () => data }
        return cursor
      },
      countDocuments: async (filter: Record<string, unknown>) => (rows[name] ?? []).filter(row => (row as Record<string, unknown>).environment === filter.environment).length,
    }),
  }),
}))

const { default: AdminRevenue } = await import('./page')
const { TrendChart, niceMax } = await import('./TrendChart')
const { MovementBars } = await import('./MovementBars')
const { BillingProviderError } = await import('@/lib/billing/providerError')

const sub = (over: Record<string, unknown>) => ({
  _id: String(Math.random()),
  userId: 'u1',
  environment: 'production',
  store: 'web',
  productId: 'plan_m',
  basePlanId: 'monthly',
  status: 'active',
  autoRenew: true,
  expiresAt: new Date(now + 20 * DAY),
  createdAt: ago(10),
  ...over,
})

async function renderPage(params: Record<string, string> = {}) {
  render(await AdminRevenue({ searchParams: Promise.resolve(params) }))
}

beforeEach(() => {
  document.body.innerHTML = ''
  pricesMock.mockResolvedValue([
    { period: 'monthly', amount: 9900, currency: 'INR' },
    { period: 'yearly', amount: 99900, currency: 'INR' },
  ])
  rows.billing_subscriptions = [
    sub({ userId: 'a', createdAt: ago(60) }),
    sub({ userId: 'b', store: 'play', productId: 'pro', basePlanId: 'yearly', expiresAt: new Date(now + 300 * DAY) }),
    sub({ userId: 'c', environment: 'sandbox' }),
  ]
  rows.billing_accounts = [
    { _id: 'a', trialStartedAt: ago(100), trialEndsAt: ago(55) },
    { _id: 'b', trialStartedAt: ago(50), trialEndsAt: ago(5) },
  ]
  rows.users = [{ _id: 'a', email: 'a@example.com', name: 'Asha' }]
})

describe('/admin/revenue', () => {
  it('shows MRR and ARR from live prices, leaving test rows out', async () => {
    await renderPage()
    // ₹99 monthly + ₹999/12 yearly = ₹182.25 → ₹182 MRR, ₹2,187 ARR
    const mrr = screen.getByText('MRR', { selector: '.adm-kpi-label' }).closest('.adm-kpi')!
    expect(within(mrr as HTMLElement).getByText('₹182')).toBeTruthy()
    const arr = screen.getByText('ARR', { selector: '.adm-kpi-label' }).closest('.adm-kpi')!
    expect(within(arr as HTMLElement).getByText('₹2,187')).toBeTruthy()
    expect(screen.getByText(/1 test rows hidden/)).toBeTruthy()
    expect(screen.getByText('₹99/mo · ₹999/yr')).toBeTruthy()
  })

  it('lists the latest purchases with who bought them', async () => {
    await renderPage()
    expect(screen.getByText('Asha')).toBeTruthy()
    expect(screen.getByText('Yearly · Google Play')).toBeTruthy()
  })

  it('falls back to subscriber counts when Razorpay is down', async () => {
    pricesMock.mockRejectedValue(new BillingProviderError('down', 503))
    await renderPage({ metric: 'mrr' })
    expect(screen.getByText(/Couldn't read plan prices/)).toBeTruthy()
    // The money tabs are gone and the chart reads payers instead.
    expect(screen.queryByRole('link', { name: 'ARR' })).toBeNull()
    expect(screen.getByText('Paying subscribers today')).toBeTruthy()
  })

  it("flags payers on a plan it can't price", async () => {
    rows.billing_subscriptions = [sub({ userId: 'w', basePlanId: 'weekly', productId: 'pro' })]
    await renderPage()
    expect(screen.getByText(/1 paying subscriber is on a plan that isn't monthly or yearly/)).toBeTruthy()
  })
})

describe('TrendChart', () => {
  const points = [
    { day: '2026-09-26', value: 0 },
    { day: '2026-09-27', value: 9900 },
    { day: '2026-09-28', value: 19800 },
  ]

  it('rounds the axis up to an even step', () => {
    expect(niceMax(19800)).toBe(20000)
    expect(niceMax(7)).toBe(8)
    expect(niceMax(0)).toBe(4)
  })

  it('reads out each day from the keyboard', () => {
    render(<TrendChart points={points} money label="MRR" />)
    const plot = screen.getByRole('img', { name: /MRR, 26 Sept 2026 to today: ₹0 to ₹198/ })
    fireEvent.keyDown(plot, { key: 'End' })
    expect(screen.getByRole('status').textContent).toContain('₹198')
    fireEvent.keyDown(plot, { key: 'ArrowLeft' })
    expect(screen.getByRole('status').textContent).toContain('₹99')
    fireEvent.keyDown(plot, { key: 'Escape' })
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('MovementBars', () => {
  const empty = { n: 0, mrr: 0 }
  const month = (over: Record<string, { n: number; mrr: number }>) => ({
    month: new Date('2026-08-31T18:30:00Z'),
    start: { mrr: 0, payers: 0 },
    end: { mrr: 0, payers: 0 },
    new: empty,
    reactivation: empty,
    expansion: empty,
    contraction: empty,
    churn: empty,
    ...over,
  })

  it('says so when nothing has moved', () => {
    render(<MovementBars months={[month({})]} />)
    expect(screen.getByText(/No MRR has moved yet/)).toBeTruthy()
  })

  it('titles each month with its net and legends only the kinds present', () => {
    const { container } = render(<MovementBars months={[month({ new: { n: 2, mrr: 19800 }, churn: { n: 1, mrr: 9900 } })]} />)
    expect(container.querySelector('.adm-move-col')!.getAttribute('title')).toContain('net +₹99')
    expect(screen.getByText('New')).toBeTruthy()
    expect(screen.getByText('Churned')).toBeTruthy()
    expect(screen.queryByText('Expansion')).toBeNull()
  })
})

it('filters test purchases before limiting and warns when production scans are incomplete', async () => {
  rows.billing_subscriptions = [sub({ environment: 'sandbox' }), ...Array.from({ length: 5001 }, (_, i) => sub({ userId: `u${i}` }))]
  rows.billing_accounts = Array.from({ length: 5001 }, (_, i) => ({ _id: `a${i}`, trialStartedAt: ago(10), trialEndsAt: new Date(now + DAY) }))
  await renderPage()
  expect(findMock).toHaveBeenCalledWith('billing_subscriptions', { environment: 'production' })
  expect(screen.getByRole('alert').textContent).toMatch(/incomplete/i)
})
