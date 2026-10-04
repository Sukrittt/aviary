// Subscription access, as the server sees it. Twin of Mobile/src/api/billing.ts.
//
// Two ways to pay, one account: Google Play in the Android app, and Razorpay
// checkout here on the web. Either one unlocks both clients, because the
// server decides access from its own verified records, not the client.
import type { UserProfile } from './account'
import { apiFetch } from './client'

export interface BillingStatus {
  mode: 'setup_incomplete' | 'trial' | 'paid' | 'expired'
  /** May the account use normal budgeting, reports, AI and writes? */
  allowed: boolean
  /** False while the server's enforcement flag is off — `allowed` is then true regardless of mode. */
  enforced: boolean
  trialStartedAt: string | null
  trialEndsAt: string | null
  trialDaysRemaining: number
  productId: string | null
  basePlanId: string | null
  paidExpiresAt: string | null
  autoRenew: boolean
  renewalState: 'active' | 'cancelled' | 'grace' | 'on_hold' | 'paused' | 'expired' | 'revoked' | 'pending' | 'scheduled' | null
  /** Where the purchase lives, so where it's managed: Google Play, or Razorpay on this site. Absent from older servers. */
  store?: 'play' | 'web' | null
  /** `mode: 'paid'` because an admin gifted the plan, not because anything was bought. Absent from older servers. */
  gifted?: boolean
  retentionDeadline: string | null
  purchaseEnabled: boolean
  /** Present and false when a sync returned stale data because the provider was unreachable. */
  refreshed?: boolean
}

export async function getBillingStatus(): Promise<BillingStatus> {
  const resp = await apiFetch('/api/billing/status')
  if (!resp.ok) throw new Error(`Failed to load billing status: ${resp.status}`)
  return resp.json()
}

/**
 * "Refresh subscription status" — for someone who bought in the Android app
 * and wants the browser to catch up without waiting for the webhook.
 *
 * A 503 means a payment provider was unreachable and the body is the *existing*
 * access, unchanged. Deliberately not thrown: an outage must not look like a
 * cancellation.
 */
export async function syncBilling(): Promise<BillingStatus> {
  const resp = await apiFetch('/api/billing/sync', { method: 'POST' })
  if (resp.status === 503) return resp.json()
  if (!resp.ok) throw new Error(`Failed to refresh subscription: ${resp.status}`)
  return resp.json()
}

/**
 * Finish onboarding server-side. This is what starts the 45-day trial, so
 * the date is the server's, not the browser's — call it after the initial
 * budget writes have landed, or it refuses.
 */
export async function completeOnboarding(): Promise<{ onboardedAt: string; user: UserProfile; access: BillingStatus }> {
  const resp = await apiFetch('/api/onboarding/complete', { method: 'POST' })
  if (!resp.ok) throw new Error(`Failed to complete onboarding: ${resp.status}`)
  return resp.json()
}

export type PlanPeriod = 'monthly' | 'yearly'

/** A web plan's price, in the currency's smallest unit (paise). */
export interface PlanPrice {
  period: PlanPeriod
  amount: number
  currency: string
}

export async function getWebPlans(): Promise<PlanPrice[]> {
  const resp = await apiFetch('/api/billing/razorpay/plans')
  if (!resp.ok) throw new Error(`Failed to load plans: ${resp.status}`)
  return (await resp.json()).plans
}

/** Thrown by startWebCheckout when the account already has a paid plan somewhere. */
export class AlreadySubscribedError extends Error {
  constructor(public store: 'play' | 'web' | null) {
    super('already subscribed')
  }
}

/** Create a Razorpay subscription for this account. Returns what Checkout needs to open. */
export async function startWebCheckout(period: PlanPeriod): Promise<{ subscriptionId: string; keyId: string }> {
  const resp = await apiFetch('/api/billing/razorpay/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ period }),
  })
  if (resp.status === 409) throw new AlreadySubscribedError((await resp.json()).store ?? null)
  if (!resp.ok) throw new Error(`Failed to start checkout: ${resp.status}`)
  return resp.json()
}

/**
 * Hand Checkout's result to the server, which re-checks it with Razorpay
 * before anything unlocks. A 503 means it couldn't confirm yet; the body is
 * the existing access and the webhook will finish the job.
 */
export async function verifyWebCheckout(result: { paymentId: string; subscriptionId: string; signature: string }): Promise<BillingStatus> {
  const resp = await apiFetch('/api/billing/razorpay/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  })
  if (resp.status === 503) return resp.json()
  if (!resp.ok) throw new Error(`Failed to confirm payment: ${resp.status}`)
  return resp.json()
}

/** Stop renewing the web subscription. Access carries on to the end of the paid cycle. */
export async function cancelWebSubscription(): Promise<BillingStatus> {
  const resp = await apiFetch('/api/billing/razorpay/cancel', { method: 'POST' })
  if (!resp.ok) throw new Error(`Failed to cancel: ${resp.status}`)
  return resp.json()
}
