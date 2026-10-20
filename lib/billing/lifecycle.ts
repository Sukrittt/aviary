/**
 * The scheduled half of the subscription lifecycle, run from the daily
 * billing cron after reconciliation: trial-ending reminders, and the
 * twelve-month retention window that follows lapsed access.
 *
 * Everything here reads the *local* verified projection, except the one
 * moment that matters: immediately before deleting anyone, the account is
 * re-verified against RevenueCat. See payment-subscriptions-plan.md, "Expiry,
 * retention, and costs".
 */
import type { Db } from 'mongodb'
import { claim, unclaim } from '../notifications/deliver'
import { sendPushNotification } from '../push'
import { purgeAccountNow } from '../accountLifecycle'
import { getSystemSettings } from '../systemSettings'
import type { UserDoc } from '../users'
import { BILLING_ACCOUNTS, BILLING_SUBSCRIPTIONS, type BillingAccountDoc, type BillingSubscriptionDoc } from './records'
import { getAccess, refreshFromProvider } from './service'

const DAY_MS = 24 * 60 * 60 * 1000
/** Days-before-the-end at which each notice fires, largest first. */
export const TRIAL_NOTICE_DAYS = [7, 3, 1] as const
export const RETENTION_NOTICE_DAYS = [30, 7, 1] as const
export const RETENTION_MONTHS = 12
/** Caps per run, so one slow provider or push service cannot run the function out of time. */
const MAX_PER_RUN = 200
const MAX_DELETIONS_PER_RUN = 20

/**
 * The notice that applies now: the smallest threshold that `msLeft` has
 * crossed. A run that first sees an account at 6.5 days left sends the "7
 * days" notice, and the next day's run finds the same tier already claimed.
 * Returns null when nothing is due yet (or the moment has passed).
 */
export function noticeTier(msLeft: number, thresholds: readonly number[]): number | null {
  if (msLeft <= 0) return null
  const crossed = thresholds.filter((d) => msLeft <= d * DAY_MS)
  return crossed.length ? Math.min(...crossed) : null
}

/** `date` plus whole calendar months in UTC, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsUtc(date: Date, months: number): Date {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(
    Date.UTC(y, m, Math.min(date.getUTCDate(), lastDay), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()),
  )
}

/** When continuous access last ended: the later of the trial's end and any purchase's paid-through date. */
export function accessEndedAt(account: Pick<BillingAccountDoc, 'trialEndsAt'>, subs: Pick<BillingSubscriptionDoc, 'expiresAt'>[]): Date {
  return subs.reduce((end, s) => (s.expiresAt && s.expiresAt > end ? s.expiresAt : end), account.trialEndsAt)
}

const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`

async function isLive(db: Db, userId: string): Promise<boolean> {
  const user = await db.collection<UserDoc>('users').findOne({ _id: userId }, { projection: { deleted_at: 1 } })
  return user !== null && !user.deleted_at
}

/** Claim-then-send, releasing the claim if the push throws so tomorrow's run retries it. */
async function notifyOnce(db: Db, userId: string, key: string, title: string, body: string): Promise<boolean> {
  if (!(await claim(db, userId, key))) return false
  try {
    await sendPushNotification({ userId, title, body, data: { route: '/account/plan' } })
    return true
  } catch (err) {
    console.error('billing lifecycle: push failed for', userId, key, err)
    await unclaim(db, userId, key)
    return false
  }
}

/**
 * Each reminder has one job. 7 days: here's your month so far. 3 days: what
 * pauses, in the user's own numbers. 1 day: tomorrow it's one tap (the
 * expired screen opens on yearly with a single button). Android can't buy
 * before the trial ends, so none of these say "subscribe now".
 */
async function trialReminderBody(db: Db, userId: string, tier: number): Promise<string> {
  if (tier === 1) return 'Tomorrow you can keep Aviary in one tap. Your data stays safe either way.'
  const n = await db.collection('expenses').countDocuments({ user_id: userId, deleted_at: null })
  const logged = `${n} expense${n === 1 ? '' : 's'}`
  if (tier === 3) return `After that, Aviary pauses. ${n ? `Your ${logged} ${n === 1 ? 'stays' : 'stay'} safe` : 'Your data stays safe'}, and export's always free.`
  return n ? `You've logged ${logged} so far. Open Aviary to see what happens next.` : 'Open Aviary to see exactly what happens next.'
}

/**
 * 7, 3 and 1 day reminders before a trial ends. Only for accounts the billing
 * switches currently apply to (`access.enforced`) and that are still on their
 * trial — someone who already subscribed is never told their trial is ending.
 */
export async function sendTrialReminders(db: Db, now: Date): Promise<{ sent: number }> {
  const horizon = new Date(now.getTime() + Math.max(...TRIAL_NOTICE_DAYS) * DAY_MS)
  const accounts = await db
    .collection<BillingAccountDoc>(BILLING_ACCOUNTS)
    .find({ trialEndsAt: { $gt: now, $lte: horizon } })
    .limit(MAX_PER_RUN)
    .toArray()

  let sent = 0
  for (const account of accounts) {
    const tier = noticeTier(account.trialEndsAt.getTime() - now.getTime(), TRIAL_NOTICE_DAYS)
    if (tier === null || !(await isLive(db, account._id))) continue
    const access = await getAccess(account._id, now)
    if (!access.enforced || access.mode !== 'trial') continue
    const key = `billing:trial:${tier}d:${account.trialEndsAt.toISOString()}`
    const title = tier === 1 ? 'Your 30 days on us end tomorrow' : `Your 30 days on us end in ${plural(tier)}`
    const body = await trialReminderBody(db, account._id, tier)
    if (await notifyOnce(db, account._id, key, title, body)) sent++
  }
  return { sent }
}

export interface RetentionResult {
  deadlinesSet: number
  noticesSent: number
  /** Accounts past their window that were deleted (0 unless `retentionDeleteEnabled`). */
  deleted: number
  /** Accounts past their window that a real run would delete. */
  due: number
  /** Skipped because the provider could not be reached — never deleted on uncertainty. */
  skipped: number
}

/**
 * Sets the deletion deadline for lapsed accounts, sends the 30/7/1-day
 * notices, and — only when `billing.retentionDeleteEnabled` — deletes accounts
 * past their window.
 *
 * A renewal clears the deadline (`refreshFromProvider`), and logging in does
 * not move it: the deadline is written once, from when access last ended.
 */
export async function runRetention(db: Db, now: Date): Promise<RetentionResult> {
  const result: RetentionResult = { deadlinesSet: 0, noticesSent: 0, deleted: 0, due: 0, skipped: 0 }
  const accounts = db.collection<BillingAccountDoc>(BILLING_ACCOUNTS)

  // 1. Deadlines for accounts that just lapsed.
  // ponytail: rescans lapsed accounts with no deadline (paid ones included)
  // each run, capped per run. Index a stored `access` projection if that set
  // grows past a few hundred.
  const lapsed = await accounts.find({ trialEndsAt: { $lte: now }, retentionDeadline: null }).limit(MAX_PER_RUN).toArray()
  for (const account of lapsed) {
    const access = await getAccess(account._id, now)
    if (!access.enforced || access.mode !== 'expired') continue
    const subs = await db.collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS).find({ userId: account._id }).toArray()
    const deadline = addMonthsUtc(accessEndedAt(account, subs), RETENTION_MONTHS)
    const res = await accounts.updateOne({ _id: account._id, retentionDeadline: null }, { $set: { retentionDeadline: deadline } })
    if (res.modifiedCount) result.deadlinesSet++
  }

  // 2. Notices ahead of the deadline.
  const horizon = new Date(now.getTime() + Math.max(...RETENTION_NOTICE_DAYS) * DAY_MS)
  const upcoming = await accounts.find({ retentionDeadline: { $gt: now, $lte: horizon } }).limit(MAX_PER_RUN).toArray()
  for (const account of upcoming) {
    const deadline = account.retentionDeadline!
    const tier = noticeTier(deadline.getTime() - now.getTime(), RETENTION_NOTICE_DAYS)
    if (tier === null || !(await isLive(db, account._id))) continue
    const key = `billing:retention:${tier}d:${deadline.toISOString()}`
    const title = tier === 1 ? 'Your Aviary data is deleted tomorrow' : `Your Aviary data is deleted in ${plural(tier)}`
    const body = 'Subscribe to keep your budget, or export it from Settings first.'
    if (await notifyOnce(db, account._id, key, title, body)) result.noticesSent++
  }

  // 3. Deletion.
  const due = await accounts.find({ retentionDeadline: { $lte: now } }).limit(MAX_DELETIONS_PER_RUN).toArray()
  const deleteEnabled = (await getSystemSettings()).billing.retentionDeleteEnabled
  for (const account of due) {
    result.due++
    if (!deleteEnabled) continue
    try {
      // Re-verified against the provider *now*, not trusted from the local
      // projection: a missed renewal webhook must never cost someone their
      // data. If the provider cannot be reached, we do not know, and not
      // knowing is never grounds for an irreversible delete.
      const access = await refreshFromProvider(account._id, now)
      if (!access.enforced || access.mode !== 'expired') continue
      await purgeAccountNow(db, account._id)
      result.deleted++
    } catch (err) {
      result.skipped++
      console.error('billing retention: not deleting', account._id, (err as Error).message)
    }
  }

  return result
}
