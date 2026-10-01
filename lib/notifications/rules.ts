import { formatMoney } from '@/src/lib/currencies'
import type { Envelope } from '@/src/types/expense'
import type { CategoryDocRow, SubscriptionDocRow, SummarizeExpensesMeta } from '@/lib/ai/expenseContext'
import { getEffectiveDueDate, renewalDays, INACTIVE_STATUSES, MONTH_NAMES, formatReadableDate } from '@/lib/subscriptions'
import type { UserDoc } from '@/lib/users'
import type { PaceOutlier } from './pace'

/**
 * Pure decision logic for Smart Notifications: given a user's current
 * envelopes/subscriptions/prefs, decide which notifications should fire
 * *right now*. No I/O, no Mongo, no Gemini — the caller (the cron route)
 * fetches the data, claims each returned `key` in the send log (skipping any
 * that are already claimed), and does the actual push.
 */

export interface NotificationPrefs {
  currencyCode?: string
  cadence: 'off' | 'weekly' | 'daily'
  /** Category limit alerts (threshold + overspent) — independent of `cadence`, which only gates the digest. */
  thresholds: boolean
  bills: boolean
  billLeadDays: number
  coach: boolean
  /** New monthly Wrapped edition unlocked — independent of `cadence`. */
  wrapped: boolean
}

/** Trigger percentages applied to any category that hasn't customized its own. */
export const DEFAULT_ALERT_PCTS = [50, 90, 100]

/** Sentinel level for an overspent envelope — always above any realistic alertPct, since `spentPct` is capped at 100. */
export const OVER_LEVEL = 101

export type NotificationKind = 'threshold' | 'overspent' | 'bill' | 'digest' | 'coach' | 'pace' | 'wrapped'

export interface Notification {
  /** Dedupe key claimed in `notification_log`; stable across runs until the underlying fact changes. */
  key: string
  kind: NotificationKind
  title: string
  body: string
  data?: Record<string, unknown>
}

/** Resolves a user's notification prefs, defaulting fields never set on the doc. */
export function prefsFor(user: UserDoc): NotificationPrefs {
  return {
    currencyCode: user.currencyCode,
    cadence: user.notifyCadence === 'weekly' || user.notifyCadence === 'daily' ? user.notifyCadence : 'off',
    thresholds: user.notifyThresholds ?? true,
    bills: user.notifyBills ?? true,
    billLeadDays: typeof user.notifyBillLeadDays === 'number' ? user.notifyBillLeadDays : 3,
    coach: user.notifyCoach ?? true,
    wrapped: user.notifyWrapped ?? true,
  }
}


/** ISO 8601 week key ('YYYY-Www') for a 'YYYY-MM-DD' date, so a weekly notification fires once per week. */
function isoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function alertPctsMap(categories: CategoryDocRow[]): Map<string, number[]> {
  return new Map(categories.filter((c) => Array.isArray(c.alertPcts)).map((c) => [c.name, c.alertPcts as number[]]))
}

/** Current crossed level for one envelope: 0 (nothing crossed) up to the highest crossed alertPct, or `OVER_LEVEL` if overspent. */
function levelFor(env: Envelope, alertPctsByCategory: Map<string, number[]>): number {
  if (env.isOverspent) return OVER_LEVEL
  if (env.assigned <= 0) return 0
  const pcts = alertPctsByCategory.get(env.category) ?? DEFAULT_ALERT_PCTS
  const crossed = pcts.filter((pct) => pct > 0 && env.spentPct >= pct)
  return crossed.length > 0 ? Math.max(...crossed) : 0
}

/** One category's current level, e.g. to sync state for a category whose level dropped and produced no notification candidate. */
export function categoryLevel(envelopes: Envelope[], categories: CategoryDocRow[], category: string): number {
  const env = envelopes.find((e) => !e.isCreditCardPayment && e.category === category)
  if (!env) return 0
  return levelFor(env, alertPctsMap(categories))
}

function thresholdNotifications(envelopes: Envelope[], categories: CategoryDocRow[], month: string, currencyCode = 'INR'): Notification[] {
  const money = (n: number) => formatMoney(Math.round(n), currencyCode)
  const alertPctsByCategory = alertPctsMap(categories)
  const out: Notification[] = []

  for (const env of envelopes) {
    if (env.isCreditCardPayment) continue

    if (env.isOverspent) {
      out.push({
        key: `over:${month}:${env.category}`,
        kind: 'overspent',
        title: `${env.category} is over budget`,
        body: `You've overspent ${money(-env.available)} in ${env.category} this month.`,
        data: { category: env.category, month, level: OVER_LEVEL },
      })
      continue
    }

    // Only the highest crossed threshold fires. The title reports *current* spend,
    // not the threshold, so a jump from 10% to 98% crossing 25/50/90 at once would
    // otherwise send three pushes reading identically ("Utilities is at 98%").
    // The level (not the key) now drives dedupe — see lib/notifications/thresholdState.ts
    // — so a drop below a threshold and a later re-cross fires again.
    const level = levelFor(env, alertPctsByCategory)
    if (level > 0) {
      out.push({
        key: `thr:${month}:${env.category}:${level}`,
        kind: 'threshold',
        title: `${env.category} is at ${Math.round(env.spentPct)}%`,
        body: `${money(env.spent)} of ${money(env.assigned)} spent in ${env.category}.`,
        data: { category: env.category, month, level },
      })
    }
  }

  return out
}

function billNotifications(subscriptions: SubscriptionDocRow[], prefs: NotificationPrefs, today: string): Notification[] {
  const money = (n: number) => formatMoney(Math.round(n), prefs.currencyCode)
  if (!prefs.bills) return []
  const out: Notification[] = []

  for (const sub of subscriptions) {
    if (sub.status && INACTIVE_STATUSES.has(sub.status.toLowerCase())) continue
    if (/one-time/i.test(sub.billing_cycle ?? '')) continue

    const dueInput = {
      nextDueDate: sub.next_due_date ?? '',
      billingCycle: sub.billing_cycle ?? '',
      renewalOrEndMonth: sub.renewal_or_end_month,
      timestamp: sub.timestamp ?? '',
    }
    if (renewalDays(dueInput, today) !== prefs.billLeadDays) continue

    const due = getEffectiveDueDate(dueInput, today)
    if (!due) continue

    const days = prefs.billLeadDays
    out.push({
      key: `bill:${sub.service}:${due}`,
      kind: 'bill',
      title: `${sub.service} renews soon`,
      body: `${money(sub.amount_inr)} due in ${days} day${days === 1 ? '' : 's'} (${formatReadableDate(due)}).`,
    })
  }

  return out
}

function digestNotification(meta: SummarizeExpensesMeta, prefs: NotificationPrefs, today: string): Notification | null {
  const money = (n: number) => formatMoney(Math.round(n), prefs.currencyCode)
  if (prefs.cadence !== 'daily' && prefs.cadence !== 'weekly') return null

  const available = Math.round(meta.totalAssigned - meta.totalSpent)
  const body = `${money(meta.totalSpent)} spent this month · ${money(available)} left · ${meta.daysLeft} day${meta.daysLeft === 1 ? '' : 's'} to go.`
  const key = prefs.cadence === 'daily' ? `digest:${today}` : `digest:w:${isoWeekKey(today)}`

  return { key, kind: 'digest', title: 'Your spending update', body }
}

function coachNotification(
  envelopes: Envelope[],
  meta: SummarizeExpensesMeta,
  prefs: NotificationPrefs,
  today: string,
): Notification | null {
  const money = (n: number) => formatMoney(Math.round(n), prefs.currencyCode)
  if (!prefs.coach) return null

  const projected = meta.daysElapsed > 0 ? (meta.totalSpent / meta.daysElapsed) * meta.totalDaysInMonth : 0
  const projectedOverspend = meta.totalAssigned > 0 && projected > meta.totalAssigned
  const overspentEnvelope = envelopes.find((e) => !e.isCreditCardPayment && e.isOverspent)

  if (!projectedOverspend && !overspentEnvelope) return null

  const body = projectedOverspend
    ? `Projected to spend ${money(projected)} this month vs ${money(meta.totalAssigned)} budgeted — consider trimming a category.`
    : `${overspentEnvelope!.category} is over budget; move some slack from an under-spent envelope to cover it guilt-free.`

  return {
    key: `coach:${isoWeekKey(today)}`,
    kind: 'coach',
    title: 'Heads up on this month',
    body,
  }
}

/**
 * "Spending faster than usual" nudge for the category `paceOutlier` picked.
 * Budgeted and on track to overshoot: project the month (spend so far plus
 * the usual rest of the month) and suggest covering the gap from the envelope
 * with the most slack. Otherwise just compare with the usual amount by now.
 * Keyed per category per month, so one hot category pushes once.
 */
function paceNotification(pace: PaceOutlier, envelopes: Envelope[], prefs: NotificationPrefs, month: string): Notification | null {
  if (!prefs.coach) return null
  const money = (n: number) => formatMoney(Math.round(n), prefs.currencyCode)
  const real = envelopes.filter((e) => !e.isCreditCardPayment)
  const env = real.find((e) => e.category === pace.category)
  const projected = pace.spent + pace.usualRest
  const budget = env && env.assigned > 0 ? env.spent + env.available : 0
  const base = { key: `pace:${month}:${pace.category}`, kind: 'pace' as const, title: `${pace.category} is running hot` }

  if (budget <= 0 || projected <= budget) {
    return { ...base, body: `${money(pace.spent)} so far vs ${money(pace.usual)} you usually spend by now.` }
  }

  let body = `${money(pace.spent)} so far, about ${pace.ratio}× your usual pace. At this rate you'll hit ${money(projected)} vs ${money(budget)} budgeted.`
  const donor = real
    .filter((e) => e.category !== pace.category && e.available > 0)
    .sort((a, b) => b.available - a.available)[0]
  if (!donor) return { ...base, body }
  body += ` Move ${money(Math.min(projected - budget, donor.available))} from ${donor.category}?`
  return { ...base, body, data: { route: '/modals/move-money', category: pace.category } }
}

/**
 * The monthly Wrapped-unlock nudge. Run as its own pass by the cron route
 * (`app/api/notifications/run`), not folded into `buildNotifications` — that
 * function's caller only fetches expense-context data for users with
 * `cadence !== 'off'`, which would silently exclude exactly the users this
 * notification exists to re-engage.
 */
export function wrappedNotification(month: string, prefs: NotificationPrefs): Notification | null {
  if (!prefs.wrapped) return null
  const [, m] = month.split('-')
  const label = MONTH_NAMES[Number(m) - 1]
  return {
    key: `wrapped:${month}`,
    kind: 'wrapped',
    title: 'Your Wrapped is ready',
    body: `Your ${label} Expense Wrapped just unlocked.`,
    data: { route: '/wrapped' },
  }
}

export function buildNotifications(input: {
  envelopes: Envelope[]
  subscriptions: SubscriptionDocRow[]
  categories: CategoryDocRow[]
  meta: SummarizeExpensesMeta
  prefs: NotificationPrefs
  today: string // 'YYYY-MM-DD'
  month: string // 'YYYY-MM'
  pace?: PaceOutlier | null
}): Notification[] {
  const { envelopes, subscriptions, categories, meta, prefs, today, month, pace } = input

  const notifications: Notification[] = []
  if (prefs.thresholds) notifications.push(...thresholdNotifications(envelopes, categories, month, prefs.currencyCode))

  // Cadence is the digest's own on/off switch — it no longer gates category
  // limit alerts (those have `prefs.thresholds`), but still gates bills and
  // the coaching nudge alongside the digest itself.
  if (prefs.cadence !== 'off') {
    notifications.push(...billNotifications(subscriptions, prefs, today))

    const digest = digestNotification(meta, prefs, today)
    if (digest) notifications.push(digest)

    const coach = coachNotification(envelopes, meta, prefs, today)
    if (coach) notifications.push(coach)

    const paceNudge = pace ? paceNotification(pace, envelopes, prefs, month) : null
    if (paceNudge) notifications.push(paceNudge)
  }

  return notifications
}
