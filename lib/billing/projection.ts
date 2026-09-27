/**
 * Maps RevenueCat's view of a customer onto our `billing_subscriptions`
 * record. Pure — takes a fetched subscriber and the instant it was fetched.
 *
 * The governing rule: **RevenueCat's entitlement decides whether the user is
 * entitled.** It already collapses Google's subscription lifecycle (grace,
 * hold, pause, refund, upgrade, resubscribe) into one answer, and re-deriving
 * that from raw store flags is how subtle "cancelled user still has access"
 * bugs get written. The individual flags are read only to explain *why*,
 * never to overrule the entitlement.
 */
import type { BillingProvider, BillingStore, SubscriptionStatus } from './records'
import type { RcSubscriber, RcSubscription } from './revenuecat'

/** Everything the projection writer needs, minus the keys the DB owns. Shared by every provider's projection. */
export interface ProjectedSubscription {
  provider: BillingProvider
  environment: 'production' | 'sandbox'
  store: BillingStore
  productId: string
  basePlanId: string | null
  storeTransactionId: string
  status: SubscriptionStatus
  autoRenew: boolean
  expiresAt: Date | null
  verifiedAt: Date
  providerRefs: { customerId?: string; entitlementId?: string; originalTransactionId?: string }
}

const date = (value: string | null | undefined): Date | null => (value ? new Date(value) : null)
const latest = (...values: (Date | null)[]): Date | null =>
  values.filter((d): d is Date => d !== null).reduce<Date | null>((best, d) => (!best || d > best ? d : best), null)

/**
 * The status label for a subscription the entitlement has already judged.
 *
 * Note the split: while the user *is* entitled, a refund or a pause flag
 * cannot take access away — payment-subscriptions-plan.md is explicit that a
 * refund is not automatically a revocation, and the entitlement result is
 * what applies. Those flags only name the failure once entitlement is gone.
 */
function statusOf(sub: RcSubscription | null, entitled: boolean): SubscriptionStatus {
  if (entitled) {
    if (sub?.billing_issues_detected_at) return 'grace'
    if (sub?.unsubscribe_detected_at) return 'cancelled'
    return 'active'
  }
  if (sub?.refunded_at) return 'revoked'
  if (sub?.auto_resume_date) return 'paused'
  if (sub?.billing_issues_detected_at) return 'on_hold'
  return 'expired'
  // `pending` is never produced here: RevenueCat grants no entitlement for an
  // unsettled purchase, and its subscriber payload has no field that
  // distinguishes "waiting on a UPI mandate" from "ended". The state exists in
  // the type because the webhook can name it; a pending purchase reaching only
  // this path is correctly treated as granting nothing.
}

/**
 * The verified subscription for `entitlementId`, or null when RevenueCat has
 * no record worth keeping. Returning null is meaningful — it is "no purchase
 * at all", distinct from a throw, which is "we could not find out".
 */
export function projectSubscriber(
  subscriber: RcSubscriber,
  entitlementId: string,
  fetchedAt: Date,
): ProjectedSubscription | null {
  const entitlement = subscriber.entitlements?.[entitlementId] ?? null
  const entries = Object.entries(subscriber.subscriptions ?? {})

  // Prefer the subscription the entitlement actually came from; otherwise the
  // most recently purchased one, so an expired customer still gets a row that
  // can explain what happened.
  const [productId, sub] = entitlement
    ? (entries.find(([id]) => id === entitlement.product_identifier) ?? [entitlement.product_identifier, null])
    : (entries.sort((a, b) => Date.parse(b[1].purchase_date) - Date.parse(a[1].purchase_date))[0] ?? [null, null])

  if (!productId) return null

  const entitlementEnd = entitlement ? latest(date(entitlement.expires_date), date(entitlement.grace_period_expires_date)) : null
  // A null `expires_date` on an entitlement means a lifetime grant. We sell
  // no such product, but a dashboard-granted entitlement (support, comp) can
  // produce one, and it must not read as "expired at the epoch".
  const lifetime = entitlement !== null && entitlementEnd === null
  const entitled = lifetime || (entitlementEnd !== null && entitlementEnd.getTime() > fetchedAt.getTime())

  const typedSub = sub as RcSubscription | null

  return {
    provider: 'revenuecat',
    environment: typedSub?.is_sandbox ? 'sandbox' : 'production',
    // RevenueCat only fronts Google Play here: iOS is out of scope and web
    // checkout goes through Razorpay directly (razorpayProjection.ts).
    store: 'play',
    productId,
    basePlanId: typedSub?.product_plan_identifier ?? entitlement?.product_plan_identifier ?? null,
    // The *original* transaction id stays stable across renewals, so a renewal
    // updates this row rather than inserting a second one — which is what
    // makes the unique index mean "one purchase, one account". When the store
    // omits it, the latest id minus Play's `..N` renewal suffix is the same
    // original order id.
    storeTransactionId:
      typedSub?.original_store_transaction_id ??
      typedSub?.store_transaction_id?.replace(/\.\.\d+$/, '') ??
      `${subscriber.original_app_user_id}:${productId}`,
    status: statusOf(typedSub, entitled),
    autoRenew: entitled && !typedSub?.unsubscribe_detected_at && !typedSub?.refunded_at,
    expiresAt: entitlementEnd ?? date(typedSub?.expires_date),
    verifiedAt: fetchedAt,
    providerRefs: {
      customerId: subscriber.original_app_user_id,
      entitlementId,
      originalTransactionId: typedSub?.original_store_transaction_id ?? undefined,
    },
  }
}
