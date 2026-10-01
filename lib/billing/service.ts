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
import { projectSubscriber } from './projection'

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
 * Re-verify one account against RevenueCat and write down the result.
 *
 * Every write path goes through here — purchase, restore, webhook, and the
 * reconciliation job — so there is exactly one place where provider state
 * becomes our state, and exactly one place to get the ordering right.
 *
 * Throws `RevenueCatError` when the provider could not be reached. That is an
 * operational failure, not a cancellation: callers must leave the existing
 * projection alone rather than recording an absence of evidence as evidence
 * of absence.
 */
export async function refreshFromProvider(userId: string, now: Date = new Date()): Promise<Access> {
  const subscriber = await fetchSubscriber(userId)
  const projected = subscriber ? projectSubscriber(subscriber, ENTITLEMENT_ID, now) : null
  const db = await getDb()

  if (projected) {
    const { storeTransactionId, provider, environment, ...rest } = projected
    // Keyed by the purchase, not the user: if the same store transaction ever
    // resolves to a different account, that is a transfer to investigate, not
    // two live entitlements to hand out.
    const key = { provider, environment, storeTransactionId }
    const coll = db.collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS)

    // Insert-if-absent, then overwrite-only-if-older. Two statements rather
    // than one upsert because a webhook and a client sync routinely race, and
    // a single `$set` upsert lets whichever *write* lands last win — which is
    // not the same as whichever *read of the provider* was most recent. A
    // slow in-flight fetch must never overwrite fresher access with stale.
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

  // A renewal clears any pending deletion: the account is in continuous use
  // again, so the retention clock that was counting down no longer applies.
  const access = await getAccess(userId, now)
  if (access.mode === 'paid' || access.mode === 'trial') {
    await db.collection<BillingAccountDoc>(BILLING_ACCOUNTS).updateOne({ _id: userId }, { $set: { retentionDeadline: null } })
  }
  return access
}
