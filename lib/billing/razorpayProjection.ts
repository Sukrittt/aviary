/**
 * Maps a Razorpay subscription onto our `billing_subscriptions` record. Pure,
 * like projection.ts: the fetched subscription and the instant it was fetched
 * in, a row out.
 *
 * Razorpay has no entitlement layer the way RevenueCat does, so the rule here
 * is the paid period itself: access runs to `current_end`, the end of the
 * cycle the user has paid for, and only the statuses that still mean "this
 * is a live, paid plan" count.
 */
import type { ProjectedSubscription } from './projection'
import type { SubscriptionStatus } from './records'
import type { PlanPeriod, RzpSubscription } from './razorpay'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How long a failed renewal keeps access while Razorpay retries it. Razorpay
 * moves the subscription to `pending` on the first failure and to `halted`
 * once its retries run out; this bounds the grace in case the `halted` update
 * never reaches us.
 */
export const RETRY_GRACE_DAYS = 7

const seconds = (value: number | null | undefined): Date | null => (value ? new Date(value * 1000) : null)

export interface RazorpayProjectionInput {
  subscription: RzpSubscription
  period: PlanPeriod | null
  environment: 'production' | 'sandbox'
  /** Our own record that the user cancelled; Razorpay stays `active` until the cycle ends. */
  cancelAtPeriodEnd: boolean
  fetchedAt: Date
}

function statusOf(sub: RzpSubscription, paidUntil: Date | null, cancelAtPeriodEnd: boolean, now: Date): SubscriptionStatus {
  const paidPeriodLeft = paidUntil !== null && paidUntil.getTime() > now.getTime()
  switch (sub.status) {
    case 'active':
      return cancelAtPeriodEnd ? 'cancelled' : 'active'
    // Mandate approved with the first charge deferred (subscribed during the
    // trial). Runs to `charge_at`. Cancelling one stops it outright, so a
    // stale read that still says `authenticated` mustn't bring it back.
    case 'authenticated':
      if (cancelAtPeriodEnd) return 'expired'
      return sub.charge_at ? 'scheduled' : 'pending'
    // Checkout opened but the first payment or mandate hasn't settled. Grants nothing.
    case 'created':
      return 'pending'
    // A renewal failed and Razorpay is retrying.
    case 'pending':
      return cancelAtPeriodEnd ? (paidPeriodLeft ? 'cancelled' : 'expired') : 'grace'
    // Retries ran out.
    case 'halted':
      return 'on_hold'
    case 'paused':
      return 'paused'
    // Cancelled (by us, or by the user revoking the mandate in their UPI app):
    // what was paid for still stands until the cycle ends.
    case 'cancelled':
      return paidPeriodLeft ? 'cancelled' : 'expired'
    default:
      return 'expired'
  }
}

export function projectRazorpaySubscription({
  subscription: sub,
  period,
  environment,
  cancelAtPeriodEnd,
  fetchedAt,
}: RazorpayProjectionInput): ProjectedSubscription {
  const paidUntil = seconds(sub.status === 'authenticated' ? sub.charge_at : sub.current_end)
  const status = statusOf(sub, paidUntil, cancelAtPeriodEnd, fetchedAt)
  // `grace` is the only status that entitles past the paid cycle.
  const expiresAt = status === 'grace' && paidUntil ? new Date(paidUntil.getTime() + RETRY_GRACE_DAYS * DAY_MS) : paidUntil

  return {
    provider: 'razorpay',
    environment,
    store: 'web',
    productId: sub.plan_id,
    basePlanId: period,
    // A Razorpay subscription id is stable across renewals, which is exactly
    // what the unique purchase index needs.
    storeTransactionId: sub.id,
    status,
    autoRenew: status === 'active' || status === 'grace' || status === 'scheduled',
    expiresAt,
    verifiedAt: fetchedAt,
    providerRefs: { customerId: sub.customer_id ?? undefined },
  }
}
