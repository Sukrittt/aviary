import { createHmac } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cancelSubscription,
  createSubscription,
  fetchSubscription,
  getPlanPrices,
  periodOfPlan,
  razorpayConfig,
  razorpayEnvironment,
  RazorpayError,
  resetPlanCache,
  subscriptionUserId,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from './razorpay'
import { BillingProviderError } from './providerError'

const ENV = {
  RAZORPAY_KEY_ID: 'rzp_test_abc',
  RAZORPAY_KEY_SECRET: 'key_secret',
  RAZORPAY_PLAN_MONTHLY: 'plan_month',
  RAZORPAY_PLAN_YEARLY: 'plan_year',
}

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('hex')
const fetchMock = vi.fn()

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  resetPlanCache()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('config', () => {
  it('is null unless every key and plan is set, so a half-configured deploy never opens checkout', () => {
    expect(razorpayConfig()).toMatchObject({ keyId: 'rzp_test_abc', plans: { monthly: 'plan_month', yearly: 'plan_year' } })
    vi.stubEnv('RAZORPAY_PLAN_YEARLY', '')
    expect(razorpayConfig()).toBeNull()
  })

  it('treats test keys as sandbox', () => {
    expect(razorpayEnvironment('rzp_test_abc')).toBe('sandbox')
    expect(razorpayEnvironment('rzp_live_abc')).toBe('production')
  })

  it('knows only our two plans', () => {
    const config = razorpayConfig()!
    expect(periodOfPlan(config, 'plan_month')).toBe('monthly')
    expect(periodOfPlan(config, 'plan_year')).toBe('yearly')
    expect(periodOfPlan(config, 'plan_other')).toBeNull()
  })
})

describe('subscriptionUserId', () => {
  it('reads the user id we attached', () => {
    expect(subscriptionUserId({ notes: { userId: 'user_a' } })).toBe('user_a')
  })

  it('is null for empty notes, which Razorpay sends as an array', () => {
    expect(subscriptionUserId({ notes: [] })).toBeNull()
    expect(subscriptionUserId({ notes: null })).toBeNull()
  })
})

describe('signatures', () => {
  it('accepts the checkout signature Razorpay makes and rejects anything else', () => {
    const good = sign('pay_1|sub_1', 'key_secret')
    expect(verifyCheckoutSignature('pay_1', 'sub_1', good, 'key_secret')).toBe(true)
    expect(verifyCheckoutSignature('pay_1', 'sub_2', good, 'key_secret')).toBe(false)
    expect(verifyCheckoutSignature('pay_1', 'sub_1', good, 'other_secret')).toBe(false)
    expect(verifyCheckoutSignature('pay_1', 'sub_1', 'not-hex', 'key_secret')).toBe(false)
    expect(verifyCheckoutSignature('pay_1', 'sub_1', '', 'key_secret')).toBe(false)
  })

  it('checks a webhook against its exact raw body', () => {
    const raw = '{"event":"subscription.charged"}'
    expect(verifyWebhookSignature(raw, sign(raw, 'hook'), 'hook')).toBe(true)
    expect(verifyWebhookSignature(`${raw} `, sign(raw, 'hook'), 'hook')).toBe(false)
  })
})

describe('API calls', () => {
  it('creates a subscription with the user id in notes, authenticated with the key pair', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'sub_1' }))
    await createSubscription('plan_year', 'yearly', 'user_a')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.razorpay.com/v1/subscriptions')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('rzp_test_abc:key_secret').toString('base64')}`)
    expect(JSON.parse(init.body)).toEqual({ plan_id: 'plan_year', total_count: 10, customer_notify: 1, notes: { userId: 'user_a' } })
  })

  it('defers the first charge to a start date when given one', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'sub_1' }))
    await createSubscription('plan_year', 'yearly', 'user_a', new Date('2026-10-17T12:00:00.000Z'))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ start_at: Date.parse('2026-10-17T12:00:00.000Z') / 1000 })
  })

  it('cancels at cycle end when asked to', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'sub_1' }))
    await cancelSubscription('sub_1', true)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.razorpay.com/v1/subscriptions/sub_1/cancel')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cancel_at_cycle_end: 1 })
  })

  it('throws a provider error, never a verdict, on a failed or refused request', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 502 }))
    await expect(fetchSubscription('sub_1')).rejects.toMatchObject({ status: 502 })
    fetchMock.mockRejectedValue(new Error('socket hang up'))
    const err = await fetchSubscription('sub_1').catch((e) => e)
    expect(err).toBeInstanceOf(RazorpayError)
    expect(err).toBeInstanceOf(BillingProviderError)
    expect(err.status).toBe(0)
  })

  it('refuses to call Razorpay at all when unconfigured', async () => {
    vi.stubEnv('RAZORPAY_KEY_SECRET', '')
    await expect(fetchSubscription('sub_1')).rejects.toBeInstanceOf(RazorpayError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('getPlanPrices', () => {
  const plan = (id: string, amount: number) => ok({ id, period: 'monthly', interval: 1, item: { amount, currency: 'INR' } })

  it('reads both prices from Razorpay and caches them', async () => {
    fetchMock.mockImplementation(async (url: string) => (url.endsWith('plan_month') ? plan('plan_month', 9900) : plan('plan_year', 99900)))
    const now = 1_000_000
    expect(await getPlanPrices(now)).toEqual([
      { period: 'monthly', amount: 9900, currency: 'INR' },
      { period: 'yearly', amount: 99900, currency: 'INR' },
    ])
    await getPlanPrices(now + 60_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await getPlanPrices(now + 11 * 60_000)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('is null when web checkout is not configured', async () => {
    vi.stubEnv('RAZORPAY_KEY_ID', '')
    expect(await getPlanPrices()).toBeNull()
  })
})
