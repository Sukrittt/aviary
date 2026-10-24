/**
 * Free months as a reward (referrals), granted without touching what anyone
 * pays. Which lever moves depends on where the account stands:
 *
 * - Trial: the trial ends a month later. A web subscription made later still
 *   starts charging at the (new) trial end.
 * - Renewing on Google Play: the next charge moves a month later, through
 *   RevenueCat's defer API, so the month is real.
 * - Anything else (a gift running, lapsed, a plan that won't renew, or a
 *   renewing web plan): a gift (`comp`) that starts after the latest of now,
 *   the running gift and the paid period. Razorpay and PayPal can't skip a
 *   cycle, so a renewing web subscriber's month is banked after their paid
 *   period rather than refunded.
 *
 * `planReward` is pure; `grantReward` applies it.
 */
import { getDb } from '../mongodb'
import { audit } from '../adminAudit'
import { countsForAccess, pickSubscription } from './access'
import { addMonthsUtc } from './lifecycle'
import { BILLING_ACCOUNTS, BILLING_SUBSCRIPTIONS, type BillingAccountDoc, type BillingSubscriptionDoc } from './records'
import { deferGoogleSubscription } from './revenuecat'
import { refreshFromProvider } from './service'

export type RewardPlan =
  | { kind: 'hold' }
  | { kind: 'extend_trial'; until: Date }
  | { kind: 'comp'; from: Date; until: Date }
  | { kind: 'play_defer'; subscriptionId: string; from: Date; until: Date }

const ENTITLING = ['active', 'cancelled', 'grace', 'scheduled']

const later = (...dates: (Date | null | undefined)[]) =>
  dates.reduce<Date>((a, d) => (d && d > a ? d : a), new Date(0))

export function planReward({ now, account, subscription, months }: {
  now: Date
  account: BillingAccountDoc | null
  subscription: BillingSubscriptionDoc | null
  months: number
}): RewardPlan {
  if (!account) return { kind: 'hold' }
  const paid = subscription && countsForAccess(subscription.environment) && ENTITLING.includes(subscription.status)
    && subscription.expiresAt && subscription.expiresAt > now ? subscription : null
  const giftUntil = account.comp && account.comp.until > now ? account.comp.until : null

  if (paid) {
    if (paid.provider === 'revenuecat' && paid.store === 'play' && paid.status === 'active' && paid.autoRenew && !giftUntil) {
      // RevenueCat wants the Play subscription id, not `id:basePlan`.
      return { kind: 'play_defer', subscriptionId: paid.productId.split(':')[0], from: paid.expiresAt!, until: addMonthsUtc(paid.expiresAt!, months) }
    }
    const from = later(now, paid.expiresAt, giftUntil, account.trialEndsAt)
    return { kind: 'comp', from, until: addMonthsUtc(from, months) }
  }
  if (giftUntil) {
    // A trial can outlast the gift; a month that overlapped it would be lost.
    const from = later(giftUntil, account.trialEndsAt)
    return { kind: 'comp', from, until: addMonthsUtc(from, months) }
  }
  if (account.trialEndsAt > now) return { kind: 'extend_trial', until: addMonthsUtc(account.trialEndsAt, months) }
  return { kind: 'comp', from: now, until: addMonthsUtc(now, months) }
}

/**
 * Give `months` of gifted Pro, stacking on a running gift and starting no
 * earlier than `from`. The admin gift form and rewards both land here.
 * Null when there's no billing account (setup never finished).
 */
export async function grantComp(userId: string, months: number, reason: string, grantedBy: string, from?: Date): Promise<Date | null> {
  const db = await getDb()
  const coll = db.collection<BillingAccountDoc>(BILLING_ACCOUNTS)
  // Compare-and-set on the gift we read, so two grants at once both stack.
  for (let attempt = 0; attempt < 5; attempt++) {
    const account = await coll.findOne({ _id: userId })
    if (!account) return null
    const now = new Date()
    const live = account.comp && account.comp.until > now ? account.comp.until : now
    const start = from && from > live ? from : live
    const until = addMonthsUtc(start, months)
    const res = await coll.updateOne(
      { _id: userId, 'comp.until': account.comp?.until ?? { $exists: false } },
      { $set: { comp: { until, reason, grantedBy, grantedAt: now }, retentionDeadline: null } },
    )
    if (res.modifiedCount) return until
  }
  throw new Error(`grantComp: gave up on ${userId} after concurrent updates`)
}

export type RewardResult = { kind: 'hold' } | { kind: 'extend_trial' | 'comp' | 'play_defer'; until: Date }

/**
 * Apply `planReward` for one account and record it in the admin audit log.
 * Not idempotent: the caller (a referral's conditional status flip) makes
 * sure it runs once.
 */
export async function grantReward(userId: string, months: number, reason: string, actor = 'system:referral'): Promise<RewardResult> {
  const db = await getDb()
  const now = new Date()
  const [account, subs] = await Promise.all([
    db.collection<BillingAccountDoc>(BILLING_ACCOUNTS).findOne({ _id: userId }),
    db.collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS).find({ userId }).toArray(),
  ])
  const plan = planReward({ now, account, subscription: pickSubscription(subs, now), months })
  let result: RewardResult
  if (plan.kind === 'hold') return plan
  if (plan.kind === 'extend_trial') {
    await db.collection<BillingAccountDoc>(BILLING_ACCOUNTS).updateOne({ _id: userId }, { $set: { trialEndsAt: plan.until, retentionDeadline: null } })
    result = { kind: 'extend_trial', until: plan.until }
  } else if (plan.kind === 'play_defer') {
    try {
      await deferGoogleSubscription(userId, plan.subscriptionId, plan.until)
      // Google doesn't always notify on a deferral, so read the new date now.
      await refreshFromProvider(userId).catch(() => {})
      result = { kind: 'play_defer', until: plan.until }
    } catch (err) {
      console.error('reward: Play defer failed, gifting after the paid period instead', userId, (err as Error).message)
      result = { kind: 'comp', until: (await grantComp(userId, months, reason, actor, plan.from))! }
    }
  } else {
    result = { kind: 'comp', until: (await grantComp(userId, months, reason, actor, plan.from))! }
  }
  await audit(actor, 'billing.reward', userId, { kind: result.kind, months, until: result.until, reason })
  return result
}
