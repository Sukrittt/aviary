import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkoutProviderFor } from './prices'
import { createPayPalSubscription, getPayPalPlanPrices, paypalConfig, planPrice, resetPayPalCache, verifyPayPalWebhook } from './paypal'

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

const fetchMock = vi.fn()
const reply = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status })

beforeEach(() => {
  resetPayPalCache()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('PAYPAL_CLIENT_ID', 'client')
  vi.stubEnv('PAYPAL_CLIENT_SECRET', 'secret')
  vi.stubEnv('PAYPAL_PLAN_MONTHLY', 'P-MONTH')
  vi.stubEnv('PAYPAL_PLAN_YEARLY', 'P-YEAR')
  vi.stubEnv('PAYPAL_WEBHOOK_ID', 'WH-1')
  vi.stubEnv('PAYPAL_ENV', 'live')
  // First call is always the OAuth token.
  fetchMock.mockResolvedValueOnce(reply({ access_token: 'tok', expires_in: 3600 }))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('paypalConfig', () => {
  it('treats anything but PAYPAL_ENV=live as sandbox, so test keys never entitle anyone', () => {
    expect(paypalConfig()!.environment).toBe('production')
    vi.stubEnv('PAYPAL_ENV', '')
    expect(paypalConfig()!.environment).toBe('sandbox')
  })

  it('is off without plan ids', () => {
    vi.stubEnv('PAYPAL_PLAN_YEARLY', '')
    expect(paypalConfig()).toBeNull()
  })
})

describe('checkoutProviderFor', () => {
  it('sends India (and unknown countries) to Razorpay, everyone else to PayPal', () => {
    expect(checkoutProviderFor('IN')).toBe('razorpay')
    expect(checkoutProviderFor(null)).toBe('razorpay')
    expect(checkoutProviderFor('US')).toBe('paypal')
  })

  it('keeps everyone on Razorpay while PayPal is not configured', () => {
    vi.stubEnv('PAYPAL_CLIENT_ID', '')
    expect(checkoutProviderFor('US')).toBe('razorpay')
  })
})

describe('createPayPalSubscription', () => {
  it('tags the subscription with the user and returns the approval link', async () => {
    fetchMock.mockResolvedValueOnce(reply({ id: 'I-1', status: 'APPROVAL_PENDING', links: [{ rel: 'approve', href: 'https://paypal.test/approve' }] }))
    const startAt = new Date('2026-11-01T00:00:00.000Z')
    const out = await createPayPalSubscription({ planId: 'P-MONTH', userId: 'user_a', startAt, returnUrl: 'https://a/r', cancelUrl: 'https://a/c' })
    expect(out).toEqual({ id: 'I-1', approveUrl: 'https://paypal.test/approve' })
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('https://api-m.paypal.com/v1/billing/subscriptions')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toMatchObject({ plan_id: 'P-MONTH', custom_id: 'user_a', start_time: startAt.toISOString() })
  })
})

describe('verifyPayPalWebhook', () => {
  const headers = new Headers({
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api.paypal.com/cert',
    'paypal-transmission-id': 't1',
    'paypal-transmission-sig': 'sig',
    'paypal-transmission-time': '2026-10-09T00:00:00Z',
  })

  it('sends the raw event untouched and trusts only SUCCESS', async () => {
    const raw = '{"id":"WH-EVT","event_type":"PAYMENT.SALE.COMPLETED",  "resource":{}}'
    fetchMock.mockResolvedValueOnce(reply({ verification_status: 'SUCCESS' }))
    expect(await verifyPayPalWebhook(headers, raw)).toBe(true)
    const sent = fetchMock.mock.calls[1][1].body as string
    expect(sent.endsWith(`"webhook_event":${raw}}`)).toBe(true)
    expect(JSON.parse(sent)).toMatchObject({ webhook_id: 'WH-1', transmission_id: 't1' })
  })

  it('refuses a failed verification, and missing headers without asking PayPal', async () => {
    fetchMock.mockResolvedValueOnce(reply({ verification_status: 'FAILURE' }))
    expect(await verifyPayPalWebhook(headers, '{}')).toBe(false)
    fetchMock.mockClear()
    expect(await verifyPayPalWebhook(new Headers(), '{}')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('plan prices', () => {
  const plan = (id: string, value: string) => ({ id, billing_cycles: [{ tenure_type: 'REGULAR', pricing_scheme: { fixed_price: { value, currency_code: 'USD' } } }] })

  it('reads the regular price in cents', () => {
    expect(planPrice(plan('P', '4.90') as never, 'monthly')).toEqual({ period: 'monthly', amount: 490, currency: 'USD' })
  })

  it('fetches both plans once and caches them', async () => {
    fetchMock.mockResolvedValueOnce(reply(plan('P-MONTH', '4.90'))).mockResolvedValueOnce(reply(plan('P-YEAR', '49.00')))
    const prices = await getPayPalPlanPrices(0)
    expect(prices).toEqual([
      { period: 'monthly', amount: 490, currency: 'USD' },
      { period: 'yearly', amount: 4900, currency: 'USD' },
    ])
    await getPayPalPlanPrices(1000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
