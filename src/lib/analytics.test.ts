import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import posthog from 'posthog-js'

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    register: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    has_opted_out_capturing: vi.fn(() => false),
  },
}))

// The key and environment are read when the module loads, so each test gets a fresh copy.
async function load(key: string | undefined, vercelEnv = 'production') {
  vi.resetModules()
  if (key === undefined) vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
  else vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', key)
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', vercelEnv)
  return import('./analytics')
}

type InitConfig = { before_send: (e: unknown) => { properties: Record<string, unknown>; $set_once?: Record<string, unknown> } }

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllEnvs())

describe('without a key', () => {
  it('never starts PostHog and drops every event', async () => {
    const a = await load(undefined)
    await a.initAnalytics()
    a.track('expense_logged')
    a.identifyUser({ id: 'user_1' })
    expect(posthog.init).not.toHaveBeenCalled()
    expect(posthog.capture).not.toHaveBeenCalled()
    expect(posthog.identify).not.toHaveBeenCalled()
    expect(a.isAnalyticsEnabled()).toBe(false)
  })
})

describe('outside production', () => {
  it.each(['preview', ''])('never starts PostHog when VERCEL_ENV is %j', async (env) => {
    const a = await load('phc_test', env)
    await a.initAnalytics()
    a.track('expense_logged')
    expect(posthog.init).not.toHaveBeenCalled()
    expect(posthog.capture).not.toHaveBeenCalled()
  })
})

describe('with a key', () => {
  it('waits for initialization even before the provider effect starts it', async () => {
    const a = await load('phc_test')
    await a.analyticsReady()
    expect(posthog.init).toHaveBeenCalledTimes(1)
    expect(a.isAnalyticsEnabled()).toBe(true)
    await a.initAnalytics()
    expect(posthog.init).toHaveBeenCalledTimes(1)
  })

  it('starts once, with autocapture and recording off, tagged as web', async () => {
    const a = await load('phc_test')
    await a.initAnalytics()
    await a.initAnalytics()
    expect(posthog.init).toHaveBeenCalledTimes(1)
    expect(posthog.init).toHaveBeenCalledWith('phc_test', expect.objectContaining({
      autocapture: false,
      disable_session_recording: true,
      capture_pageview: 'history_change',
    }))
    expect(posthog.register).toHaveBeenCalledWith({ platform: 'web' })
  })

  it('strips query strings from every URL property before sending', async () => {
    const a = await load('phc_test')
    await a.initAnalytics()
    const { before_send } = vi.mocked(posthog.init).mock.calls[0][1] as unknown as InitConfig
    const out = before_send({
      properties: { $current_url: 'https://aviary.app/code?email=a%40b.com', $referrer: '$direct', $utm_source: 'x' },
      $set_once: { $initial_current_url: 'https://aviary.app/?utm_source=x&ref=y' },
    })
    expect(out.properties).toEqual({ $current_url: 'https://aviary.app/code', $referrer: '$direct', $utm_source: 'x' })
    expect(out.$set_once).toEqual({ $initial_current_url: 'https://aviary.app/' })
  })

  it('forwards events, and stamps first-time person properties with $set_once', async () => {
    const a = await load('phc_test')
    await a.initAnalytics()
    a.track('money_moved', { sources_count: 2 })
    expect(posthog.capture).toHaveBeenCalledWith('money_moved', { sources_count: 2 })
    a.trackFirst('expense_logged', 'first_expense_at', { payment_method: 'bank' })
    expect(posthog.capture).toHaveBeenLastCalledWith('expense_logged', {
      payment_method: 'bank',
      $set_once: { first_expense_at: expect.any(String) },
    })
  })

  it('keeps a throwing client from breaking the caller', async () => {
    const a = await load('phc_test')
    await a.initAnalytics()
    vi.mocked(posthog.capture).mockImplementationOnce(() => { throw new Error('boom') })
    expect(() => a.track('expense_deleted')).not.toThrow()
  })

  it('queues calls made while PostHog is still loading, then sends them in order', async () => {
    const a = await load('phc_test')
    const started = a.initAnalytics()
    a.identifyUser({ id: 'user_1' })
    a.track('store_cta_clicked')
    expect(posthog.capture).not.toHaveBeenCalled()
    await started
    expect(posthog.identify).toHaveBeenCalledWith('user_1', {})
    expect(posthog.capture).toHaveBeenCalledWith('store_cta_clicked', undefined)
    expect(vi.mocked(posthog.identify).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(posthog.capture).mock.invocationCallOrder[0])
  })

  it('stops queueing once loading fails', async () => {
    vi.mocked(posthog.init).mockImplementationOnce(() => { throw new Error('blocked') })
    const a = await load('phc_test')
    await a.initAnalytics()
    expect(a.isAnalyticsLoading()).toBe(false)
    a.track('expense_logged')
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('drops calls made before init', async () => {
    const a = await load('phc_test')
    a.track('expense_logged')
    await a.initAnalytics()
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('identifies with the WorkOS id, and only the fields it has', async () => {
    const a = await load('phc_test')
    await a.initAnalytics()
    a.identifyUser({ id: 'user_1', email: 'a@b.com', name: null })
    expect(posthog.identify).toHaveBeenCalledWith('user_1', { email: 'a@b.com' })
    a.resetAnalytics()
    expect(posthog.reset).toHaveBeenCalled()
  })

  // posthog.reset() clears registered properties, so sign-out used to leave
  // every later event in this tab without `platform`.
  it('puts platform back after the sign-out reset', async () => {
    const a = await load('phc_test')
    await a.initAnalytics()
    vi.mocked(posthog.register).mockClear()
    a.resetAnalytics()
    expect(posthog.register).toHaveBeenCalledWith({ platform: 'web' })
    expect(vi.mocked(posthog.reset).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(posthog.register).mock.invocationCallOrder[0])
  })

  it('turns analytics off and on', async () => {
    const a = await load('phc_test')
    await a.initAnalytics()
    a.setAnalyticsEnabled(false)
    expect(posthog.opt_out_capturing).toHaveBeenCalled()
    a.setAnalyticsEnabled(true)
    expect(posthog.opt_in_capturing).toHaveBeenCalled()
    expect(a.isAnalyticsEnabled()).toBe(true)
  })
})

describe('stripQuery', () => {
  it('keeps origin and path, and leaves non-URLs alone', async () => {
    const a = await load(undefined)
    expect(a.stripQuery('https://aviary.app/expense?date=2026-09-01#top')).toBe('https://aviary.app/expense')
    expect(a.stripQuery('$direct')).toBe('$direct')
  })
})
