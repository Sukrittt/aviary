/**
 * Billing persistence: starting the trial clock, and reading the current
 * access decision for a user.
 *
 * Everything here is server-owned. No function takes a trial date, plan,
 * paid flag, or billing owner id from a caller — the only input is a user id
 * already verified by `lib/access.ts`.
 */
import type { Db } from 'mongodb'
import { getDb } from '../mongodb'
import { billingFlagsFor } from './flags'
import type { UserDoc } from '../users'
import { INCOME_CATEGORY } from '@/src/lib/envelope'
import {
  BILLING_ACCOUNTS,
  BILLING_SUBSCRIPTIONS,
  type BillingAccountDoc,
  type BillingSubscriptionDoc,
  type TrialCohort,
} from './records'
import { pickSubscription, resolveAccess, trialWindow, type Access } from './access'
import { ENTITLEMENT_ID, fetchSubscriber } from './revenuecat'
import { projectSubscriber, type ProjectedSubscription } from './projection'
import {
  cancelSubscription,
  fetchSubscription,
  periodOfPlan,
  razorpayConfig,
  razorpayEnvironment,
  RazorpayError,
  subscriptionUserId,
} from './razorpay'
import { projectRazorpaySubscription } from './razorpayProjection'

/**
 * Start the 45-day clock, once, for good.
 *
 * `$setOnInsert` under the unique `_id` is the whole concurrency story: two
 * simultaneous onboarding completions, a reinstall, a logout/login, or a
 * migration rerun all collapse into the same first write. A device clock,
 * a client body, and a retried request cannot move these dates.
 *
 * Returns the account as it now stands — the existing one if a trial was
 * already granted.
 */
export async function startTrial(
  db: Db,
  userId: string,
  cohort: TrialCohort,
  now: Date = new Date(),
): Promise<BillingAccountDoc> {
  const { trialStartedAt, trialEndsAt } = trialWindow(now)
  const result = await db.collection<BillingAccountDoc>(BILLING_ACCOUNTS).findOneAndUpdate(
    { _id: userId },
    { $setOnInsert: { _id: userId, trialStartedAt, trialEndsAt, trialCohort: cohort, createdAt: now } },
    { upsert: true, returnDocument: 'after' },
  )
  return result!
}

/** Did this account actually persist an initial budget setup? */
export async function hasCompletedSetup(db: Db, userId: string): Promise<boolean> {
  const live = { user_id: userId, deleted_at: null }
  const [budget, category] = await Promise.all([
    db.collection('budgets').findOne({ ...live, category: INCOME_CATEGORY }, { projection: { _id: 1 } }),
    db.collection('categories').findOne(live, { projection: { _id: 1 } }),
  ])
  return Boolean(budget && category)
}

/**
 * The account's current access decision.
 *
 * Reads the local verified projection only. A budgeting request must never
 * call the payment provider — purchases, webhooks and the reconciliation job
 * are what refresh these rows.
 */
export async function getAccess(userId: string, now: Date = new Date()): Promise<Access> {
  const db = await getDb()
  const [account, subs, flags] = await Promise.all([
    db.collection<BillingAccountDoc>(BILLING_ACCOUNTS).findOne({ _id: userId }),
    db.collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS).find({ userId }).toArray(),
    billingFlagsFor(userId),
  ])
  return resolveAccess({
    now,
    account,
    subscription: pickSubscription(subs, now),
    enforced: flags.enforced,
  })
}

export type CompleteOnboardingResult =
  | { ok: true; onboardedAt: string; account: BillingAccountDoc }
  | { ok: false; reason: 'setup_incomplete' }

/**
 * The server-owned completion action: the one place a trial can begin.
 *
 * Order is deliberate. The trial is granted *before* the user is marked
 * onboarded, so a failure between the two leaves a retryable state
 * (un-onboarded, trial already granted and idempotent) rather than an
 * onboarded account with no clock — which the resolver would read as setup
 * still incomplete.
 *
 * The caller's supplied timestamp is ignored everywhere: the completion
 * instant is server UTC, so a device clock, a reinstall, or a replayed
 * request cannot move it.
 */
export async function completeOnboarding(
  db: Db,
  userId: string,
  now: Date = new Date(),
  opts: { requireSetup?: boolean } = {},
): Promise<CompleteOnboardingResult> {
  const requireSetup = opts.requireSetup ?? true
  if (!(await hasCompletedSetup(db, userId))) {
    if (requireSetup) return { ok: false, reason: 'setup_incomplete' }
    // The legacy PATCH path passes `requireSetup: false`. An app version
    // already on Play has finished its wizard by the time it calls this, and
    // our check is a heuristic about what that wizard wrote — so being wrong
    // here must not leave someone stuck on the setup screen forever, retrying
    // a request that will keep failing. Granting the trial early costs
    // nothing: it is one trial per account either way, and starting it sooner
    // can only shorten the user's own.
    console.warn('[billing] completing onboarding for', userId, 'without a verified initial setup')
  }

  const account = await startTrial(db, userId, 'onboarding-v1', now)

  // Only stamped once: re-running completion must not move a date the app
  // already showed the user, or reorder them in the admin list.
  const onboardedAt = now.toISOString()
  const users = db.collection<UserDoc>('users')
  // `getStartedAt` is intentionally stamped in the same first-time write. Old
  // accounts already have onboardedAt, so a deploy never back-enables the card
  // for people who completed setup before this flow existed.
  await users.updateOne(
    { _id: userId, onboardedAt: { $in: [null, undefined] } },
    { $set: { onboardedAt, getStartedAt: onboardedAt } },
  )
  const user = await users.findOne({ _id: userId }, { projection: { onboardedAt: 1 } })

  return { ok: true, onboardedAt: user?.onboardedAt ?? onboardedAt, account }
}

/**
 * Write one verified purchase down. Insert-if-absent, then
 * overwrite-only-if-older: two statements rather than one upsert because a
 * webhook and a client sync routinely race, and a single `$set` upsert lets
 * whichever *write* lands last win, which is not the same as whichever *read
 * of the provider* was most recent. A slow in-flight fetch must never
 * overwrite fresher access with stale.
 */
async function writeProjection(db: Db, userId: string, projected: ProjectedSubscription, now: Date): Promise<void> {
  const { storeTransactionId, provider, environment, ...rest } = projected
  // Keyed by the purchase, not the user: if the same store transaction ever
  // resolves to a different account, that is a transfer to investigate, not
  // two live entitlements to hand out.
  const key = { provider, environment, storeTransactionId }
  const coll = db.collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS)
  try {
    await coll.updateOne(key, { $setOnInsert: { ...key, ...rest, userId, createdAt: now, updatedAt: now } }, { upsert: true })
  } catch (err) {
    // Two concurrent inserts for the same purchase: the unique index threw
    // for the loser. The row now exists, so the conditional update below is
    // exactly the right next step.
    if ((err as { code?: number }).code !== 11000) throw err
  }
  await coll.updateOne({ ...key, verifiedAt: { $lt: now } }, { $set: { userId, ...rest, updatedAt: now } })
}

/** Google Play, through RevenueCat. Writes nothing when RevenueCat has never seen this user. */
async function refreshRevenueCat(db: Db, userId: string, now: Date): Promise<void> {
  const subscriber = await fetchSubscriber(userId)
  const projected = subscriber ? projectSubscriber(subscriber, ENTITLEMENT_ID, now) : null
  if (projected) await writeProjection(db, userId, projected, now)
}

/**
 * Re-verify one Razorpay subscription and write it down under `userId`.
 *
 * Refuses a subscription whose `notes.userId` is someone else: the id arrives
 * from a browser or a webhook, and neither is allowed to decide whose access
 * it grants.
 */
export async function recordRazorpaySubscription(userId: string, subscriptionId: string, now: Date = new Date()): Promise<Access> {
  const db = await getDb()
  await refreshRazorpayOne(db, userId, subscriptionId, now)
  return finishRefresh(db, userId, now)
}

async function refreshRazorpayOne(db: Db, userId: string, subscriptionId: string, now: Date): Promise<void> {
  const config = razorpayConfig()
  if (!config) throw new RazorpayError('Razorpay is not configured', 0)
  const subscription = await fetchSubscription(subscriptionId)
  const owner = subscriptionUserId(subscription)
  if (owner !== userId) throw new RazorpaySubscriptionOwnerError(subscriptionId)

  const environment = razorpayEnvironment(config.keyId)
  const existing = await db
    .collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS)
    .findOne({ provider: 'razorpay', environment, storeTransactionId: subscription.id }, { projection: { cancelAtPeriodEnd: 1 } })

  const projected = projectRazorpaySubscription({
    subscription,
    period: periodOfPlan(config, subscription.plan_id),
    environment,
    cancelAtPeriodEnd: existing?.cancelAtPeriodEnd ?? false,
    fetchedAt: now,
  })
  await writeProjection(db, userId, projected, now)
}

/** Every Razorpay subscription we already hold for this user. New ones arrive through checkout verify or the webhook. */
async function refreshRazorpay(db: Db, userId: string, now: Date): Promise<void> {
  const rows = await db
    .collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS)
    .find({ userId, provider: 'razorpay' }, { projection: { storeTransactionId: 1 } })
    .toArray()
  if (rows.length === 0) return
  for (const row of rows) await refreshRazorpayOne(db, userId, row.storeTransactionId, now)
}

/** A renewal clears any pending deletion: the account is in continuous use again. */
async function finishRefresh(db: Db, userId: string, now: Date): Promise<Access> {
  const access = await getAccess(userId, now)
  if (access.mode === 'paid' || access.mode === 'trial') {
    await db.collection<BillingAccountDoc>(BILLING_ACCOUNTS).updateOne({ _id: userId }, { $set: { retentionDeadline: null } })
  }
  return access
}

/**
 * Re-verify one account against every provider and write down the result.
 *
 * Every write path goes through here: purchase, restore, webhook, and the
 * reconciliation job. So there is exactly one place where provider state
 * becomes our state, and exactly one place to get the ordering right.
 *
 * Both providers are asked even if one fails, so a RevenueCat outage can't
 * hold up a web subscriber's renewal (or the other way round). Whatever did
 * verify is written; then the first failure is thrown.
 *
 * Throws `BillingProviderError` when a provider could not be reached. That is
 * an operational failure, not a cancellation: callers must leave the
 * existing projection alone rather than recording an absence of evidence as
 * evidence of absence.
 */
export async function refreshFromProvider(userId: string, now: Date = new Date()): Promise<Access> {
  const db = await getDb()
  const results = await Promise.allSettled([refreshRevenueCat(db, userId, now), refreshRazorpay(db, userId, now)])
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed) throw failed.reason
  return finishRefresh(db, userId, now)
}

/**
 * Stop every renewing web subscription this user has. Used by account
 * deletion: unlike Google Play, a Razorpay subscription is ours to cancel, so
 * deleting the account must not leave a mandate charging someone who has
 * gone. Cancels at the end of the paid cycle; nothing already paid is taken
 * back.
 */
export async function cancelWebSubscriptions(userId: string, now: Date = new Date()): Promise<number> {
  const db = await getDb()
  const coll = db.collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS)
  const live = await coll
    .find({ userId, provider: 'razorpay', status: { $in: ['active', 'grace', 'pending', 'paused'] }, cancelAtPeriodEnd: { $ne: true } })
    .toArray()
  for (const row of live) await cancelRazorpayRow(db, row, now)
  return live.length
}

/**
 * Cancel one Razorpay subscription at the end of its cycle and record that
 * it won't renew. The flag is written only after Razorpay accepted the
 * cancel, so a failure leaves the row saying "renews", which is the truth.
 */
export async function cancelRazorpayRow(db: Db, row: BillingSubscriptionDoc, now: Date = new Date()): Promise<void> {
  // Razorpay refuses a cycle-end cancel for a subscription with no paid
  // cycle to end; those have nothing to keep, so they stop now.
  const atCycleEnd = row.status === 'active' || row.status === 'grace'
  await cancelSubscription(row.storeTransactionId, atCycleEnd)
  await db
    .collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS)
    .updateOne({ _id: row._id }, { $set: { cancellationEmailPending: row.environment === 'production', cancelAtPeriodEnd: true, status: row.status === 'active' ? 'cancelled' : row.status, autoRenew: false, updatedAt: now } })
  // The cancel itself has landed. A failed re-read only means the row's other
  // fields are a little stale until the next refresh; it must not make the
  // caller think the cancel failed and try again.
  try {
    await refreshRazorpayOne(db, row.userId, row.storeTransactionId, now)
  } catch (err) {
    console.error('billing: re-read after cancel failed for', row.storeTransactionId, (err as Error).message)
  }
}

/** A subscription id that belongs to another account. Never written, never retried. */
export class RazorpaySubscriptionOwnerError extends Error {
  constructor(subscriptionId: string) {
    super(`Razorpay subscription ${subscriptionId} doesn't belong to this account`)
  }
}
