/**
 * Billing records — selling access to Envelope.
 *
 * Deliberately namespaced `billing_*`. The existing `subscriptions`
 * collection (and `lib/subscriptions.ts`) is a *user's own* recurring
 * expenses — Netflix, Spotify — and has nothing to do with paying us.
 *
 * Product baseline: ../../pricing.md, design: ../../payment-subscriptions-plan.md.
 */
import type { ObjectId } from 'mongodb'

export const BILLING_ACCOUNTS = 'billing_accounts'
export const BILLING_SUBSCRIPTIONS = 'billing_subscriptions'
export const BILLING_EVENTS = 'billing_events'

/** Trial length. 45 × 24h of real time, not 45 calendar days. */
export const TRIAL_DAYS = 45

/**
 * Which trial-granting rule created an account's dates. Recorded so a
 * migration rerun (or a policy change later) can tell cohorts apart and
 * never restarts a clock that already ran.
 */
export type TrialCohort = 'onboarding-v1' | 'legacy-launch-v1'

/**
 * A gifted plan: access an admin granted by hand, with no purchase behind it.
 *
 * Kept on the account rather than faked as a `billing_subscriptions` row on
 * purpose. Reconciliation overwrites that collection from RevenueCat, so a
 * fake row there would be wiped by the next sync — and every revenue count
 * would include people who never paid.
 */
export interface CompGrant {
  /** Access ends at this instant, exactly like a paid entitlement's `expiresAt`. */
  until: Date
  /** Why it was given. Shown in the admin list and recorded in the audit entry. */
  reason: string
  /** The admin user id that granted it. */
  grantedBy: string
  grantedAt: Date
}

/**
 * One per paying identity, keyed by the WorkOS user id — the same id
 * `lib/access.ts` resolves from a bearer token or a session cookie. Trial
 * dates here are server-owned and immutable: only ever written with
 * `$setOnInsert`, never from a client body.
 */
export interface BillingAccountDoc {
  _id: string
  trialStartedAt: Date
  trialEndsAt: Date
  trialCohort: TrialCohort
  /** When budgeting data becomes eligible for deletion. Set by the retention job (phase 5), cleared on renewal. */
  retentionDeadline?: Date | null
  /** Admin-granted free access. Null/absent = none. Revocable; only ever written from /admin/subscriptions. */
  comp?: CompGrant | null
  createdAt: Date
}

/** Who verified a purchase. RevenueCat fronts Google Play; Razorpay sells on the web directly. */
export type BillingProvider = 'revenuecat' | 'razorpay'

/**
 * Where the purchase lives, which is where the user manages it. Rows written
 * before web checkout existed have no reason to carry anything but `'play'`.
 */
export type BillingStore = 'play' | 'web'

/** Verified store subscription status, mapped from the provider's own lifecycle. */
export type SubscriptionStatus =
  | 'active'
  /** User turned off auto-renew; still entitled until `expiresAt`. */
  | 'cancelled'
  /** Payment failed, store is retrying; Google keeps the user entitled. */
  | 'grace'
  /** Grace elapsed, store suspended the subscription. Not entitled. */
  | 'on_hold'
  | 'paused'
  | 'expired'
  | 'revoked'
  /** Slow payment method (UPI mandate, carrier billing) not yet settled. Grants nothing. */
  | 'pending'

/**
 * A purchase, as verified against the provider — never as reported by a
 * client. One row per store purchase; `storeTransactionId` is unique per
 * provider+environment so the same purchase cannot entitle two accounts.
 */
export interface BillingSubscriptionDoc {
  _id: ObjectId
  userId: string
  provider: BillingProvider
  environment: 'production' | 'sandbox'
  store: BillingStore
  productId: string
  basePlanId: string | null
  storeTransactionId: string
  status: SubscriptionStatus
  autoRenew: boolean
  /** End of the paid (or grace) entitlement. Null only while `pending`. */
  expiresAt: Date | null
  /** Last time this row was confirmed against the provider, not the last webhook received. */
  verifiedAt: Date
  providerRefs: { customerId?: string; entitlementId?: string; originalTransactionId?: string }
  /**
   * Razorpay only: the user asked us to stop renewing. Razorpay keeps the
   * subscription `active` until the paid cycle ends, so this is the one place
   * that knows it will not renew. Written by the cancel route, never by a
   * provider refresh.
   */
  cancellationEmailPending?: boolean
  cancelAtPeriodEnd?: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Received provider notifications. Unique on provider+environment+eventId so
 * a duplicate delivery is a no-op insert rather than a second state change.
 */
export interface BillingEventDoc {
  _id: ObjectId
  provider: BillingProvider
  environment: 'production' | 'sandbox'
  eventId: string
  type: string
  userId: string | null
  receivedAt: Date
  processedAt: Date | null
  state: 'received' | 'processed' | 'failed'
  attempts: number
  emailKind?: import('@/lib/email/subscriptionTemplate').SubscriptionEmailKind | null
  emailHandledAt?: Date
  error?: string
  /** Minimized payload — identifiers and lifecycle fields only, never a full receipt. */
  summary: Record<string, unknown>
}
