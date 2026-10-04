/**
 * Revenue analytics for /admin/revenue: MRR, ARR and how they moved.
 *
 * Pure on purpose, like access.ts: callers pass the rows, the prices and the
 * instant, so every number on the dashboard is testable without a database.
 *
 * ponytail: `billing_subscriptions` rows record *that* someone paid, not *what*
 * they paid. Values here come from today's list price for the row's plan
 * period (Razorpay's live plan prices), applied to Play rows too. A price
 * change, a Play price that differs from the web one, or a promo is not
 * reflected. Past MRR is reconstructed from each row's `createdAt` →
 * `expiresAt` span, so a grace gap in the middle of a subscription reads as
 * paid. Store the charged amount on the row if either ever matters.
 */
import type { BillingAccountDoc, BillingStore, BillingSubscriptionDoc } from './records'

export type Period = 'monthly' | 'yearly'

/** List price per period, in paise. */
export type Prices = Record<Period, number>

const DAY_MS = 24 * 60 * 60 * 1000
const IST_OFFSET = '+05:30'

/**
 * Estimated provider cut, for net revenue. Google Play takes 15% of
 * subscription revenue; Razorpay's standard rate is 2% plus 18% GST on it.
 * Both are estimates: UPI AutoPay and negotiated rates can differ.
 */
export const STORE_FEE: Record<BillingStore, number> = { play: 0.15, web: 0.0236 }

type Sub = Pick<
  BillingSubscriptionDoc,
  'userId' | 'environment' | 'store' | 'productId' | 'basePlanId' | 'status' | 'autoRenew' | 'expiresAt' | 'createdAt'
> & Partial<Pick<BillingSubscriptionDoc, 'verifiedAt'>>

/**
 * A row's billing period. Razorpay rows store `monthly` / `yearly` as the base
 * plan; Play base plan ids are ours to name, so match the usual spellings
 * (`yearly`, `annual`, ISO `p1y`). Null for anything else, which the dashboard
 * counts as unpriced rather than guessing.
 */
export function periodOf(sub: Pick<Sub, 'productId' | 'basePlanId'>): Period | null {
  const text = `${sub.basePlanId ?? ''} ${sub.productId}`.toLowerCase()
  if (/year|annual|p1y|12m/.test(text)) return 'yearly'
  if (/month|p1m/.test(text)) return 'monthly'
  return null
}

/** One period's price as a monthly amount, in paise. */
export function monthlyValue(period: Period | null, prices: Prices | null): number {
  if (!period || !prices) return 0
  return period === 'monthly' ? prices.monthly : prices.yearly / 12
}

/**
 * Rows that represent money received. Sandbox rows are test purchases,
 * `pending` never settled, `scheduled` isn't charged until the trial ends,
 * and `revoked` was refunded.
 */
export function isRevenueRow(sub: Sub): sub is Sub & { expiresAt: Date } {
  return sub.environment === 'production' && !['pending', 'scheduled', 'revoked'].includes(sub.status) && sub.expiresAt !== null
}

export interface Payer {
  userId: string
  sub: Sub
  period: Period | null
  store: BillingStore
  /** Monthly value in paise; 0 when unpriced. */
  mrr: number
}

/** Who was paying at `at`, one entry per user: the covering row that runs longest. */
export function payersAt(subs: Sub[], at: Date, prices: Prices | null): Map<string, Payer> {
  const t = at.getTime()
  const out = new Map<string, Payer>()
  for (const sub of subs) {
    if (!isRevenueRow(sub) || sub.createdAt.getTime() > t || sub.expiresAt.getTime() <= t) continue
    // Keep earlier paid history, but stop counting access-denying states from
    // their latest verification onward. Exact historical transitions are not stored.
    if (['paused', 'on_hold', 'expired'].includes(sub.status) && (!sub.verifiedAt || sub.verifiedAt.getTime() <= t)) continue
    const prev = out.get(sub.userId)
    if (prev && prev.sub.expiresAt!.getTime() >= sub.expiresAt.getTime()) continue
    const period = periodOf(sub)
    out.set(sub.userId, { userId: sub.userId, sub, period, store: sub.store, mrr: monthlyValue(period, prices) })
  }
  return out
}

const sumMrr = (payers: Iterable<Payer>) => [...payers].reduce((sum, p) => sum + p.mrr, 0)

type Split = { n: number; mrr: number }
const zero = (): Split => ({ n: 0, mrr: 0 })

export interface RevenueSummary {
  mrr: number
  arr: number
  /** MRR after the estimated store fees. */
  netMrr: number
  payers: number
  /** Average MRR per paying user. 0 with no payers. */
  arppu: number
  byPeriod: Record<Period | 'unpriced', Split>
  byStore: Record<BillingStore, Split>
  /** Paid through the period but set not to renew. */
  cancelling: Split
  /** Payment failing, store retrying. */
  grace: Split
  /** Auto-renewing within `renewalDays`: what should be charged, at full plan price. */
  renewals: { n: number; amount: number }
}

export function summarize(subs: Sub[], now: Date, prices: Prices | null, renewalDays = 30): RevenueSummary {
  const payers = [...payersAt(subs, now, prices).values()]
  const mrr = sumMrr(payers)
  const byPeriod = { monthly: zero(), yearly: zero(), unpriced: zero() }
  const byStore = { play: zero(), web: zero() }
  const cancelling = zero()
  const grace = zero()
  const renewals = { n: 0, amount: 0 }
  let netMrr = 0
  const horizon = now.getTime() + renewalDays * DAY_MS

  for (const p of payers) {
    const bucket = byPeriod[p.period ?? 'unpriced']
    bucket.n++
    bucket.mrr += p.mrr
    byStore[p.store].n++
    byStore[p.store].mrr += p.mrr
    netMrr += p.mrr * (1 - STORE_FEE[p.store])
    if (p.sub.status === 'cancelled' || !p.sub.autoRenew) {
      cancelling.n++
      cancelling.mrr += p.mrr
    } else if (p.sub.status === 'grace') {
      grace.n++
      grace.mrr += p.mrr
    } else if (p.sub.status === 'active' && p.period && prices && p.sub.expiresAt!.getTime() <= horizon) {
      renewals.n++
      renewals.amount += prices[p.period]
    }
  }

  return {
    mrr,
    arr: mrr * 12,
    netMrr,
    payers: payers.length,
    arppu: payers.length ? mrr / payers.length : 0,
    byPeriod,
    byStore,
    cancelling,
    grace,
    renewals,
  }
}

export interface SeriesPoint {
  /** IST calendar day, YYYY-MM-DD. */
  day: string
  mrr: number
  payers: number
}

export const istDay = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

/** MRR and payer count at this moment on each of the last `days` days, oldest first. The last point is `now`. */
export function mrrSeries(subs: Sub[], days: number, now: Date, prices: Prices | null): SeriesPoint[] {
  const points: SeriesPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const at = new Date(now.getTime() - i * DAY_MS)
    const payers = payersAt(subs, at, prices)
    points.push({ day: istDay(at), mrr: sumMrr(payers.values()), payers: payers.size })
  }
  return points
}

export interface Movement {
  start: { mrr: number; payers: number }
  end: { mrr: number; payers: number }
  /** First-ever payers. */
  new: Split
  /** Paid before, lapsed, paying again. */
  reactivation: Split
  /** Same payer, higher MRR. */
  expansion: Split
  /** Same payer, lower MRR (e.g. monthly to yearly). Positive amount. */
  contraction: Split
  /** Paying at `from`, not at `to`. Positive amount. */
  churn: Split
}

/**
 * How MRR got from `from` to `to`, by payer. Compares two snapshots, so a
 * subscription that starts and lapses entirely inside the window is not seen.
 */
export function movement(subs: Sub[], from: Date, to: Date, prices: Prices | null): Movement {
  const before = payersAt(subs, from, prices)
  const after = payersAt(subs, to, prices)
  const paidBefore = new Set(subs.filter((s) => isRevenueRow(s) && s.createdAt.getTime() < from.getTime()).map((s) => s.userId))
  const m: Movement = {
    start: { mrr: sumMrr(before.values()), payers: before.size },
    end: { mrr: sumMrr(after.values()), payers: after.size },
    new: zero(),
    reactivation: zero(),
    expansion: zero(),
    contraction: zero(),
    churn: zero(),
  }
  const add = (split: Split, amount: number) => {
    split.n++
    split.mrr += amount
  }
  for (const [userId, b] of before) {
    const a = after.get(userId)
    if (!a) add(m.churn, b.mrr)
    else if (a.mrr > b.mrr) add(m.expansion, a.mrr - b.mrr)
    else if (a.mrr < b.mrr) add(m.contraction, b.mrr - a.mrr)
  }
  for (const [userId, a] of after) {
    if (before.has(userId)) continue
    add(paidBefore.has(userId) ? m.reactivation : m.new, a.mrr)
  }
  return m
}

/** Start of the IST calendar month `back` months before the one `now` is in. */
export function istMonthStart(now: Date, back: number): Date {
  const [y, mo] = istDay(now).split('-').map(Number)
  const total = y * 12 + (mo - 1) - back
  const month = String((total % 12) + 1).padStart(2, '0')
  return new Date(`${Math.floor(total / 12)}-${month}-01T00:00:00${IST_OFFSET}`)
}

/** One movement per IST calendar month, oldest first. The current month runs to `now`. */
export function monthlyMovements(subs: Sub[], months: number, now: Date, prices: Prices | null): Array<{ month: Date } & Movement> {
  const out: Array<{ month: Date } & Movement> = []
  for (let back = months - 1; back >= 0; back--) {
    const start = istMonthStart(now, back)
    const end = back === 0 ? now : istMonthStart(now, back - 1)
    out.push({ month: start, ...movement(subs, start, end, prices) })
  }
  return out
}

export interface Retention {
  /** Share of payers at the start who stopped paying. Null with no payers at the start. */
  logoChurn: number | null
  /** Churned plus contracted MRR, over starting MRR. */
  revenueChurn: number | null
  /** Starting payers' MRR at the end, over their MRR at the start. New payers excluded. */
  netRetention: number | null
  /** ARPPU over monthly logo churn: expected lifetime revenue per payer. Null when nobody churned. */
  ltv: number | null
}

/** Retention over one window, normalised to a month for LTV. Use a 30-day window for a monthly reading. */
export function retention(m: Movement, windowDays: number): Retention {
  const { start } = m
  const logoChurn = start.payers ? m.churn.n / start.payers : null
  const revenueChurn = start.mrr ? (m.churn.mrr + m.contraction.mrr) / start.mrr : null
  const netRetention = start.mrr ? (start.mrr + m.expansion.mrr - m.contraction.mrr - m.churn.mrr) / start.mrr : null
  const monthlyChurn = logoChurn === null ? null : logoChurn * (30 / windowDays)
  const arppu = start.payers ? start.mrr / start.payers : 0
  return { logoChurn, revenueChurn, netRetention, ltv: monthlyChurn && arppu ? arppu / monthlyChurn : null }
}

export interface Cohort {
  month: Date
  started: number
  /** Trials that have run out (or converted) by now: the fair denominator. */
  decided: number
  converted: number
}

type Account = Pick<BillingAccountDoc, '_id' | 'trialStartedAt' | 'trialEndsAt'>

/**
 * Trial-to-paid by the IST month the trial started. A trial counts as
 * converted once its user has any revenue row, at any time.
 */
export function trialCohorts(accounts: Account[], subs: Sub[], months: number, now: Date): Cohort[] {
  const paid = new Set(subs.filter(isRevenueRow).map((s) => s.userId))
  const cohorts: Cohort[] = Array.from({ length: months }, (_, i) => ({ month: istMonthStart(now, months - 1 - i), started: 0, decided: 0, converted: 0 }))
  for (const a of accounts) {
    const t = a.trialStartedAt.getTime()
    let i = cohorts.length - 1
    while (i >= 0 && cohorts[i].month.getTime() > t) i--
    if (i < 0) continue
    const c = cohorts[i]
    c.started++
    const converted = paid.has(a._id)
    if (converted) c.converted++
    if (converted || a.trialEndsAt.getTime() <= now.getTime()) c.decided++
  }
  return cohorts
}

/** Median whole days from trial start to first revenue row, over users who converted. Null with none. */
export function medianDaysToConvert(accounts: Account[], subs: Sub[]): number | null {
  const first = new Map<string, number>()
  for (const s of subs) {
    if (!isRevenueRow(s)) continue
    const t = s.createdAt.getTime()
    if (!first.has(s.userId) || t < first.get(s.userId)!) first.set(s.userId, t)
  }
  const days = accounts
    .filter((a) => first.has(a._id))
    .map((a) => Math.max(0, Math.floor((first.get(a._id)! - a.trialStartedAt.getTime()) / DAY_MS)))
    .sort((x, y) => x - y)
  if (days.length === 0) return null
  const mid = Math.floor(days.length / 2)
  return days.length % 2 ? days[mid] : Math.round((days[mid - 1] + days[mid]) / 2)
}
