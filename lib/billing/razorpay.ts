/**
 * Razorpay, server side. Web checkout only: Android purchases go through
 * Google Play and RevenueCat (revenuecat.ts), because Play requires it.
 *
 * Same rule as the RevenueCat client: this is the only file that talks to the
 * provider, and nothing a browser reports is believed until it has been
 * re-fetched from here with the secret key.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { BillingProviderError } from './providerError'

const API_BASE = 'https://api.razorpay.com/v1'
const TIMEOUT_MS = 10_000

/**
 * Billing cycles a new subscription is created for. Razorpay requires a
 * finite count; these are long enough to read as "until you cancel".
 */
export const TOTAL_COUNT: Record<PlanPeriod, number> = { monthly: 120, yearly: 10 }

export type PlanPeriod = 'monthly' | 'yearly'

export class RazorpayError extends BillingProviderError {}

/** Razorpay's subscription lifecycle. See razorpayProjection.ts for what each one means for access. */
export type RzpSubscriptionStatus =
  | 'created'
  | 'authenticated'
  | 'active'
  | 'pending'
  | 'halted'
  | 'cancelled'
  | 'completed'
  | 'expired'
  | 'paused'

/** The subscription fields this app reads. Razorpay returns more. Timestamps are unix seconds. */
export interface RzpSubscription {
  id: string
  plan_id: string
  customer_id?: string | null
  status: RzpSubscriptionStatus
  current_start: number | null
  current_end: number | null
  ended_at: number | null
  charge_at?: number | null
  paid_count: number
  remaining_count?: number | string | null
  notes: Record<string, string> | unknown[] | null
}

export interface RzpPlan {
  id: string
  period: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  item: { amount: number; currency: string; name?: string }
}

export interface RazorpayConfig {
  keyId: string
  keySecret: string
  plans: Record<PlanPeriod, string>
}

/** The configured keys and plan ids, or null when web checkout is not set up on this deployment. */
export function razorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  const monthly = process.env.RAZORPAY_PLAN_MONTHLY
  const yearly = process.env.RAZORPAY_PLAN_YEARLY
  if (!keyId || !keySecret || !monthly || !yearly) return null
  return { keyId, keySecret, plans: { monthly, yearly } }
}

/** Test-mode keys (`rzp_test_…`) write sandbox rows, so a test purchase can never collide with a real one. */
export function razorpayEnvironment(keyId: string): 'production' | 'sandbox' {
  return keyId.startsWith('rzp_test_') ? 'sandbox' : 'production'
}

/** Which of our plans a Razorpay plan id is, or null for one we don't sell. */
export function periodOfPlan(config: RazorpayConfig, planId: string): PlanPeriod | null {
  if (planId === config.plans.monthly) return 'monthly'
  if (planId === config.plans.yearly) return 'yearly'
  return null
}

/** The app user id we attached when creating the subscription. Razorpay returns `[]` for empty notes. */
export function subscriptionUserId(sub: Pick<RzpSubscription, 'notes'>): string | null {
  const notes = sub.notes
  if (!notes || Array.isArray(notes)) return null
  return typeof notes.userId === 'string' ? notes.userId : null
}

function requireConfig(): RazorpayConfig {
  const config = razorpayConfig()
  if (!config) throw new RazorpayError('Razorpay is not configured', 0)
  return config
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const { keyId, keySecret } = requireConfig()
  let resp: Response
  try {
    resp = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (err) {
    throw new RazorpayError(`Razorpay request failed: ${(err as Error).message}`, 0)
  }
  if (!resp.ok) throw new RazorpayError(`Razorpay responded ${resp.status}`, resp.status)
  return (await resp.json()) as T
}

/**
 * Current provider truth for one subscription. Throws on anything but a
 * clean answer: "we couldn't ask" must never be written down as "not paid".
 */
export function fetchSubscription(subscriptionId: string): Promise<RzpSubscription> {
  return call('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`)
}

export function fetchPlan(planId: string): Promise<RzpPlan> {
  return call('GET', `/plans/${encodeURIComponent(planId)}`)
}

/**
 * Start a subscription for `userId`. The user id rides along in `notes`, which
 * is how a webhook (which carries no session) knows whose access to refresh,
 * and how the verify step refuses a subscription that belongs to someone else.
 */
export function createSubscription(planId: string, period: PlanPeriod, userId: string): Promise<RzpSubscription> {
  return call('POST', '/subscriptions', {
    plan_id: planId,
    total_count: TOTAL_COUNT[period],
    customer_notify: 1,
    notes: { userId },
  })
}

/**
 * Stop renewing. `atCycleEnd` keeps what the user already paid for, which is
 * what a cancel button means; `false` ends it now.
 */
export function cancelSubscription(subscriptionId: string, atCycleEnd: boolean): Promise<RzpSubscription> {
  return call('POST', `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 })
}

function hmacMatches(payload: string, secret: string, signature: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest()
  let given: Buffer
  try {
    given = Buffer.from(signature, 'hex')
  } catch {
    return false
  }
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * The signature Checkout hands the browser after a subscription payment:
 * HMAC-SHA256 of `payment_id|subscription_id` under the key secret.
 */
export function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string, keySecret: string): boolean {
  return hmacMatches(`${paymentId}|${subscriptionId}`, keySecret, signature)
}

/** `X-Razorpay-Signature` on a webhook: HMAC-SHA256 of the raw body under the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  return hmacMatches(rawBody, secret, signature)
}

/** What the picker and the pricing page show. Amounts are in the currency's smallest unit (paise). */
export interface PlanPrice {
  period: PlanPeriod
  amount: number
  currency: string
}

const PLAN_CACHE_MS = 10 * 60 * 1000
let planCache: { at: number; prices: PlanPrice[] } | null = null

/**
 * Our two plans' prices, read from Razorpay so the number shown is always the
 * number charged. Cached in-process: prices change rarely, and the public
 * pricing page shouldn't cost a provider call per visitor. Null when web
 * checkout isn't configured.
 */
export async function getPlanPrices(now: number = Date.now()): Promise<PlanPrice[] | null> {
  const config = razorpayConfig()
  if (!config) return null
  if (planCache && now - planCache.at < PLAN_CACHE_MS) return planCache.prices
  const periods: PlanPeriod[] = ['monthly', 'yearly']
  const plans = await Promise.all(periods.map((p) => fetchPlan(config.plans[p])))
  const prices = plans.map((plan, i) => ({ period: periods[i], amount: plan.item.amount, currency: plan.item.currency }))
  planCache = { at: now, prices }
  return prices
}

/** Test seam: forget cached prices. */
export function resetPlanCache(): void {
  planCache = null
}
