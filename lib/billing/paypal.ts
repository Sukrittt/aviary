/**
 * PayPal Subscriptions, server side. Web checkout for buyers outside India:
 * Razorpay (razorpay.ts) can only take domestic payments on this account, and
 * an Indian PayPal account can only take foreign ones, so each covers the
 * other's gap.
 *
 * Same rules as razorpay.ts: this is the only file that talks to PayPal, and
 * nothing a browser reports is believed until it has been re-fetched from
 * here with the secret.
 */
import { BillingProviderError } from './providerError'
import type { PlanPeriod, PlanPrice } from './razorpay'

const TIMEOUT_MS = 10_000

export class PayPalError extends BillingProviderError {}

/** PayPal's subscription lifecycle. See paypalProjection.ts for what each one means for access. */
export type PpSubscriptionStatus = 'APPROVAL_PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED'

/** The subscription fields this app reads. PayPal returns more. Times are ISO strings. */
export interface PpSubscription {
  id: string
  plan_id: string
  status: PpSubscriptionStatus
  custom_id?: string
  start_time?: string
  subscriber?: { payer_id?: string }
  billing_info?: {
    next_billing_time?: string
    last_payment?: { time?: string }
    failed_payments_count?: number
  }
  links?: { href: string; rel: string }[]
}

interface PpPlan {
  id: string
  billing_cycles: { tenure_type: 'REGULAR' | 'TRIAL'; pricing_scheme?: { fixed_price?: { value: string; currency_code: string } } }[]
}

export interface PayPalConfig {
  clientId: string
  clientSecret: string
  plans: Record<PlanPeriod, string>
  /** Verifies webhook deliveries. Optional so checkout can be tried before the webhook is set up. */
  webhookId: string | null
  environment: 'production' | 'sandbox'
}

/** The configured credentials and plan ids, or null when PayPal checkout is not set up on this deployment. */
export function paypalConfig(): PayPalConfig | null {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET
  const monthly = process.env.PAYPAL_PLAN_MONTHLY
  const yearly = process.env.PAYPAL_PLAN_YEARLY
  if (!clientId || !clientSecret || !monthly || !yearly) return null
  return {
    clientId,
    clientSecret,
    plans: { monthly, yearly },
    webhookId: process.env.PAYPAL_WEBHOOK_ID || null,
    // Sandbox credentials write sandbox rows, which never entitle anyone.
    environment: process.env.PAYPAL_ENV === 'live' ? 'production' : 'sandbox',
  }
}

const apiBase = (config: PayPalConfig) => (config.environment === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')

/** Which of our plans a PayPal plan id is, or null for one we don't sell. */
export function periodOfPayPalPlan(config: PayPalConfig, planId: string): PlanPeriod | null {
  if (planId === config.plans.monthly) return 'monthly'
  if (planId === config.plans.yearly) return 'yearly'
  return null
}

function requireConfig(): PayPalConfig {
  const config = paypalConfig()
  if (!config) throw new PayPalError('PayPal is not configured', 0)
  return config
}

async function send(url: string, init: RequestInit): Promise<Response> {
  let resp: Response
  try {
    resp = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
  } catch (err) {
    throw new PayPalError(`PayPal request failed: ${(err as Error).message}`, 0)
  }
  if (!resp.ok) throw new PayPalError(`PayPal responded ${resp.status}`, resp.status)
  return resp
}

let token: { value: Promise<string>; until: number; clientId: string } | null = null

/**
 * An OAuth access token, reused until shortly before PayPal says it expires.
 * The in-flight request is what's cached, so parallel calls share one token.
 */
function accessToken(config: PayPalConfig, now = Date.now()): Promise<string> {
  if (token && token.clientId === config.clientId && now < token.until) return token.value
  const value = send(`${apiBase(config)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  }).then(async (resp) => {
    const body = (await resp.json()) as { access_token: string; expires_in: number }
    if (token?.value === value) token.until = now + (body.expires_in - 60) * 1000
    return body.access_token
  })
  // Until PayPal answers, assume a short life; a failure clears it so the next call retries.
  token = { value, until: now + 60_000, clientId: config.clientId }
  value.catch(() => {
    if (token?.value === value) token = null
  })
  return value
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: string): Promise<T | null> {
  const config = requireConfig()
  const resp = await send(`${apiBase(config)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken(config)}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
  })
  // Cancel answers 204 with no body.
  return resp.status === 204 ? null : ((await resp.json()) as T)
}

/**
 * Current provider truth for one subscription. Throws on anything but a
 * clean answer: "we couldn't ask" must never be written down as "not paid".
 */
export async function fetchPayPalSubscription(subscriptionId: string): Promise<PpSubscription> {
  return (await call<PpSubscription>('GET', `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`))!
}

/**
 * Start a subscription for `userId` and return where to send the buyer to
 * approve it. The user id rides along as `custom_id`, the same job `notes`
 * does for Razorpay: it's how a webhook knows whose access to refresh, and
 * how verify refuses a subscription that belongs to someone else.
 *
 * `startAt` defers the first charge, so someone subscribing mid-trial keeps
 * the days they have left.
 */
export async function createPayPalSubscription(opts: {
  planId: string
  userId: string
  startAt: Date | null
  returnUrl: string
  cancelUrl: string
}): Promise<{ id: string; approveUrl: string }> {
  const sub = (await call<PpSubscription>(
    'POST',
    '/v1/billing/subscriptions',
    JSON.stringify({
      plan_id: opts.planId,
      custom_id: opts.userId,
      ...(opts.startAt ? { start_time: opts.startAt.toISOString() } : {}),
      application_context: {
        brand_name: 'Aviary',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: opts.returnUrl,
        cancel_url: opts.cancelUrl,
      },
    }),
  ))!
  const approveUrl = sub.links?.find((l) => l.rel === 'approve')?.href
  if (!approveUrl) throw new PayPalError('PayPal returned no approval link', 0)
  return { id: sub.id, approveUrl }
}

/**
 * Stop the subscription. PayPal has no "at cycle end" option: it stops
 * billing now, and the paid cycle carries on in our projection instead.
 */
export async function cancelPayPalSubscription(subscriptionId: string): Promise<void> {
  await call('POST', `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, JSON.stringify({ reason: 'Cancelled from the Aviary account page' }))
}

/**
 * Ask PayPal whether a webhook delivery is genuine. PayPal signs with a
 * certificate rather than a shared secret, so it's PayPal's own endpoint that
 * checks. The raw body is spliced in as-is: re-serialising the parsed event
 * can reorder or reformat it and fail a genuine delivery.
 */
export async function verifyPayPalWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const config = requireConfig()
  if (!config.webhookId) return false
  const field = (name: string) => headers.get(name) ?? ''
  const meta = {
    auth_algo: field('paypal-auth-algo'),
    cert_url: field('paypal-cert-url'),
    transmission_id: field('paypal-transmission-id'),
    transmission_sig: field('paypal-transmission-sig'),
    transmission_time: field('paypal-transmission-time'),
    webhook_id: config.webhookId,
  }
  if (Object.values(meta).some((v) => !v)) return false
  const body = `${JSON.stringify(meta).slice(0, -1)},"webhook_event":${rawBody}}`
  const result = await call<{ verification_status: string }>('POST', '/v1/notifications/verify-webhook-signature', body)
  return result?.verification_status === 'SUCCESS'
}

/** A plan's regular price in the currency's smallest unit ("4.90" USD → 490). */
export function planPrice(plan: PpPlan, period: PlanPeriod): PlanPrice {
  const price = plan.billing_cycles.find((c) => c.tenure_type === 'REGULAR')?.pricing_scheme?.fixed_price
  if (!price) throw new PayPalError(`PayPal plan ${plan.id} has no fixed price`, 0)
  return { period, amount: Math.round(Number(price.value) * 100), currency: price.currency_code }
}

const PLAN_CACHE_MS = 10 * 60 * 1000
let planCache: { at: number; prices: PlanPrice[] } | null = null

/** Our two plans' prices, read from PayPal and cached like Razorpay's. Null when PayPal isn't configured. */
export async function getPayPalPlanPrices(now: number = Date.now()): Promise<PlanPrice[] | null> {
  const config = paypalConfig()
  if (!config) return null
  if (planCache && now - planCache.at < PLAN_CACHE_MS) return planCache.prices
  const periods: PlanPeriod[] = ['monthly', 'yearly']
  const plans = await Promise.all(periods.map((p) => call<PpPlan>('GET', `/v1/billing/plans/${encodeURIComponent(config.plans[p])}`)))
  const prices = plans.map((plan, i) => planPrice(plan!, periods[i]))
  planCache = { at: now, prices }
  return prices
}

/** Test seam: forget cached prices and the access token. */
export function resetPayPalCache(): void {
  planCache = null
  token = null
}
