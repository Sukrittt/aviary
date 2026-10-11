/**
 * Maps a PayPal subscription onto our `billing_subscriptions` record. Pure,
 * like razorpayProjection.ts: the fetched subscription and the instant it was
 * fetched in, a row out.
 *
 * Access runs to the end of the cycle the last payment bought. That's derived
 * from `last_payment.time` rather than read off `next_billing_time`, because
 * PayPal drops the next billing time once a subscription is cancelled, and a
 * cancel must still leave the paid cycle standing.
 */
import type { ProjectedSubscription } from './projection'
import type { SubscriptionStatus } from './records'
import type { PlanPeriod } from './razorpay'
import type { PpSubscription } from './paypal'
import { RETRY_GRACE_DAYS } from './razorpayProjection'

const DAY_MS = 24 * 60 * 60 * 1000

const date = (value: string | undefined): Date | null => (value ? new Date(value) : null)

/** One billing period after `from`, in UTC. Jan 31 plus a month is Feb 28, not Mar 3. */
export function addPeriod(from: Date, period: PlanPeriod): Date {
  const months = period === 'monthly' ? 1 : 12
  const d = new Date(from)
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(from.getUTCDate(), lastDay))
  return d
}

export interface PayPalProjectionInput {
  subscription: PpSubscription
  period: PlanPeriod | null
  environment: 'production' | 'sandbox'
  fetchedAt: Date
}

export function projectPayPalSubscription({ subscription: sub, period, environment, fetchedAt }: PayPalProjectionInput): ProjectedSubscription {
  const lastPayment = date(sub.billing_info?.last_payment?.time)
  const nextBilling = date(sub.billing_info?.next_billing_time)
  // A plan we don't recognise has no period to add, so trust PayPal's own next date.
  const paidUntil = lastPayment ? (period ? addPeriod(lastPayment, period) : nextBilling) : null
  const paidPeriodLeft = paidUntil !== null && paidUntil.getTime() > fetchedAt.getTime()

  let status: SubscriptionStatus
  let expiresAt: Date | null = paidUntil
  switch (sub.status) {
    case 'ACTIVE':
      if (!lastPayment) {
        // Approved with the first charge deferred (subscribed during the
        // trial). Runs to the first charge, like a Razorpay `authenticated`.
        status = nextBilling ? 'scheduled' : 'pending'
        expiresAt = nextBilling
      } else if ((sub.billing_info?.failed_payments_count ?? 0) > 0) {
        // A renewal failed and PayPal is retrying. Bounded, in case the
        // suspension never reaches us.
        status = 'grace'
        expiresAt = paidUntil ? new Date(paidUntil.getTime() + RETRY_GRACE_DAYS * DAY_MS) : null
      } else status = 'active'
      break
    // Approved with a start in the future (subscribed during the trial):
    // scheduled to its start, the same as an ACTIVE one with no payment yet.
    case 'APPROVED': {
      const start = date(sub.start_time)
      if (start && start.getTime() > fetchedAt.getTime()) {
        status = 'scheduled'
        expiresAt = start
      } else status = 'pending'
      break
    }
    // The buyer hasn't approved yet. Grants nothing.
    case 'APPROVAL_PENDING':
      status = 'pending'
      break
    // Missed payments ran past the plan's threshold, or someone paused it.
    case 'SUSPENDED':
      status = 'on_hold'
      break
    // Cancelled by us, or by the buyer from their PayPal account: what was
    // paid for still stands until the cycle ends.
    case 'CANCELLED':
      status = paidPeriodLeft ? 'cancelled' : 'expired'
      break
    default:
      status = 'expired'
  }

  return {
    provider: 'paypal',
    environment,
    store: 'web',
    productId: sub.plan_id,
    basePlanId: period,
    // Stable across renewals, which is what the unique purchase index needs.
    storeTransactionId: sub.id,
    status,
    autoRenew: status === 'active' || status === 'grace' || status === 'scheduled',
    expiresAt,
    verifiedAt: fetchedAt,
    providerRefs: { customerId: sub.subscriber?.payer_id },
  }
}
