import { pageMetadata } from '@/lib/seo'
import Link from 'next/link'
import {
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  Repeat,
  ShieldCheck,
  Smartphone,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Users,
  Globe,
  type LucideIcon,
} from 'lucide-react'
import { getDb } from '@/lib/mongodb'
import { displayName, type UserDoc } from '@/lib/users'
import { getPlanPrices } from '@/lib/billing/razorpay'
import { BillingProviderError } from '@/lib/billing/providerError'
import { BILLING_ACCOUNTS, BILLING_SUBSCRIPTIONS, type BillingAccountDoc, type BillingSubscriptionDoc } from '@/lib/billing/records'
import {
  STORE_FEE,
  isRevenueRow,
  medianDaysToConvert,
  monthlyMovements,
  movement,
  mrrSeries,
  periodOf,
  retention,
  summarize,
  trialCohorts,
  type Prices,
} from '@/lib/billing/revenue'
import { RangeTabs } from '../RangeTabs'
import { fmtDate, inr, num, parseRange, percent } from '../format'
import { TrendChart } from './TrendChart'
import { KINDS, MovementBars, monthLabel, netOf } from './MovementBars'

/** Same cap and reasoning as /admin/subscriptions: resolved in memory, fine at a few thousand rows. */
const MAX_SCAN = 5000
const DAY_MS = 86400000
const MOVEMENT_MONTHS = 12
const COHORT_MONTHS = 6

const METRICS = {
  mrr: { label: 'MRR', money: true },
  arr: { label: 'ARR', money: true },
  payers: { label: 'Paying subscribers', money: false },
} as const
type Metric = keyof typeof METRICS

type Params = Promise<{ range?: string; metric?: string }>

/** Live plan prices, or null when web checkout isn't configured or Razorpay can't be reached. */
async function loadPrices(): Promise<Prices | null> {
  try {
    const prices = await getPlanPrices()
    if (!prices) return null
    const by = Object.fromEntries(prices.map((p) => [p.period, p.amount]))
    return by.monthly && by.yearly ? { monthly: by.monthly, yearly: by.yearly } : null
  } catch (err) {
    if (err instanceof BillingProviderError) return null
    throw err
  }
}

/** "+12%" / "−3%" against a baseline; null when there's no baseline to compare with. */
function delta(now: number, then: number): { text: string; up: boolean } | null {
  if (!then) return null
  const change = (now - then) / then
  if (Math.abs(change) < 0.005) return { text: 'No change', up: true }
  return { text: `${change > 0 ? '+' : '−'}${Math.abs(Math.round(change * 100))}%`, up: change > 0 }
}

function Hero({ label, value, note, icon: Icon, change }: { label: string; value: string; note: string; icon: LucideIcon; change?: ReturnType<typeof delta> }) {
  return (
    <div className="adm-kpi adm-stat adm-tone t-paid">
      <div className="adm-stat-top">
        <span className="adm-stat-icon">
          <Icon size={16} />
        </span>
        {change && (
          <span className={`adm-delta ${change.up ? 'is-up' : 'is-down'}`}>
            {change.up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {change.text}
          </span>
        )}
      </div>
      <div className="adm-kpi-value">{value}</div>
      <div className="adm-kpi-label">{label}</div>
      <div className="adm-kpi-note">{note}</div>
    </div>
  )
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="adm-kpi">
      <div className="adm-kpi-label">{label}</div>
      <div className="adm-kpi-value">{value}</div>
      <div className="adm-kpi-note">{note}</div>
    </div>
  )
}

export default async function AdminRevenue({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const days = parseRange(params.range)
  const now = new Date()

  const db = await getDb()
  const [scannedSubs, scannedAccounts, prices, sandbox] = await Promise.all([
    db.collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS).find({ environment: 'production' }).sort({ createdAt: -1, _id: 1 }).limit(MAX_SCAN + 1).toArray(),
    db
      .collection<BillingAccountDoc>(BILLING_ACCOUNTS)
      .find({}, { projection: { trialStartedAt: 1, trialEndsAt: 1 } })
      .sort({ trialStartedAt: -1, _id: 1 })
      .limit(MAX_SCAN + 1)
      .toArray(),
    loadPrices(),
    db.collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS).countDocuments({ environment: 'sandbox' }),
  ])
  const incomplete = scannedSubs.length > MAX_SCAN || scannedAccounts.length > MAX_SCAN
  const subs = scannedSubs.slice(0, MAX_SCAN)
  const accounts = scannedAccounts.slice(0, MAX_SCAN)

  // Without prices only the payer count means anything, so the chart falls back to it.
  const metric: Metric = !prices ? 'payers' : params.metric === 'arr' || params.metric === 'payers' ? params.metric : 'mrr'

  const s = summarize(subs, now, prices)
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS)
  const last30 = movement(subs, monthAgo, now, prices)
  const r = retention(last30, 30)
  const series = mrrSeries(subs, days, now, prices)
  const points = series.map((p) => ({ day: p.day, value: metric === 'payers' ? p.payers : metric === 'arr' ? p.mrr * 12 : p.mrr }))
  const first = points[0].value
  const current = points[points.length - 1].value
  const months = monthlyMovements(subs, MOVEMENT_MONTHS, now, prices)
  const cohorts = trialCohorts(accounts, subs, COHORT_MONTHS, now)
  const medianDays = medianDaysToConvert(accounts, subs)
  const decided = cohorts.reduce((sum, c) => sum + c.decided, 0)
  const converted = cohorts.reduce((sum, c) => sum + c.converted, 0)

  const recent = subs
    .filter(isRevenueRow)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8)
  const users = new Map(
    (
      await db
        .collection<UserDoc>('users')
        .find({ _id: { $in: recent.map((x) => x.userId) } }, { projection: { email: 1, name: 1, firstName: 1, lastName: 1 } })
        .toArray()
    ).map((u) => [u._id, u]),
  )

  const money = (paise: number) => (prices ? inr(paise) : '—')
  const metricHref = (m: Metric) => `?${new URLSearchParams({ ...(params.range && { range: params.range }), metric: m })}`

  return (
    <>
      <div className="adm-head">
        <h1>Revenue</h1>
        <div className="adm-status">
          <span className={`adm-chip ${prices ? 'adm-tone t-paid' : 'is-off'}`}>
            <CircleDollarSign size={14} />
            {prices ? `${inr(prices.monthly)}/mo · ${inr(prices.yearly)}/yr` : 'Prices unavailable'}
          </span>
          <span className="adm-chip">
            <ShieldCheck size={14} />
            Production only{sandbox ? ` · ${num(sandbox)} test rows hidden` : ''}
          </span>
        </div>
      </div>

      {incomplete && (
        <div className="adm-notice" role="alert">
          <TriangleAlert size={17} />
          <p>Revenue figures are incomplete. This view uses at most {num(MAX_SCAN)} recent production subscriptions and trial accounts.</p>
        </div>
      )}
      {!prices && (
        <div className="adm-notice">
          <TriangleAlert size={17} />
          <p>
            Couldn&apos;t read plan prices from Razorpay, so money figures are hidden and the chart shows paying subscribers. Check the RAZORPAY_* settings, or try
            again in a minute.
          </p>
        </div>
      )}
      {s.byPeriod.unpriced.n > 0 && (
        <div className="adm-notice">
          <TriangleAlert size={17} />
          <p>
            {num(s.byPeriod.unpriced.n)} paying subscriber{s.byPeriod.unpriced.n === 1 ? ' is' : 's are'} on a plan that isn&apos;t monthly or yearly, so they&apos;re
            counted but add nothing to MRR.
          </p>
        </div>
      )}

      <div className="adm-grid adm-grid-4">
        <Hero label="MRR" icon={Repeat} value={money(s.mrr)} note="Yearly plans counted as a twelfth a month" change={prices ? delta(s.mrr, last30.start.mrr) : null} />
        <Hero label="ARR" icon={CalendarClock} value={money(s.arr)} note="MRR × 12" change={prices ? delta(s.arr, last30.start.mrr * 12) : null} />
        <Hero label="Paying subscribers" icon={Users} value={num(s.payers)} note="Gifted plans and trials left out" change={delta(s.payers, last30.start.payers)} />
        <Hero label="ARPPU" icon={CreditCard} value={money(s.arppu)} note="Average MRR per paying user" />
      </div>
      <p className="adm-sub">Changes compare with 30 days ago.</p>

      <section className="erd-card">
        <div className="adm-chart-head">
          <nav className="erd-chart-toggle" aria-label="Metric">
            {(Object.keys(METRICS) as Metric[]).map((m) =>
              !prices && METRICS[m].money ? null : (
                <Link key={m} href={metricHref(m)} scroll={false} className={m === metric ? 'is-active' : undefined} aria-current={m === metric ? 'true' : undefined}>
                  {METRICS[m].label}
                </Link>
              ),
            )}
          </nav>
          <RangeTabs param="range" value={days} params={params} />
        </div>
        <div className="adm-stats">
          <div>
            <b>{METRICS[metric].money ? inr(current) : num(current)}</b>
            <span>{METRICS[metric].label} today</span>
          </div>
          <div>
            <b>
              {current - first < 0 ? '−' : '+'}
              {METRICS[metric].money ? inr(Math.abs(current - first)) : num(Math.abs(current - first))}
            </b>
            <span>change, last {days} days</span>
          </div>
          <div>
            <b>{first ? percent((current - first) / first) : '—'}</b>
            <span>growth, last {days} days</span>
          </div>
          <div>
            <b>{METRICS[metric].money ? inr(Math.max(...points.map((p) => p.value))) : num(Math.max(...points.map((p) => p.value)))}</b>
            <span>peak in range</span>
          </div>
        </div>
        <TrendChart points={points} money={METRICS[metric].money} label={METRICS[metric].label} />
      </section>

      <div className="adm-two">
        <section className="erd-card">
          <div className="adm-chart-head">
            <h2>MRR movement</h2>
            <span className="adm-sub">Last {MOVEMENT_MONTHS} months</span>
          </div>
          {prices ? <MovementBars months={months} /> : <p className="adm-empty">Needs plan prices.</p>}
          {prices && (
            <details className="adm-details">
              <summary>Show as a table</summary>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      {Object.values(KINDS).map((k) => (
                        <th key={k.label} className="num">
                          {k.label}
                        </th>
                      ))}
                      <th className="num">Net</th>
                      <th className="num">MRR at end</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...months].reverse().map((m) => {
                      const net = netOf(m)
                      return (
                        <tr key={m.month.toISOString()}>
                          <td>{monthLabel(m.month, true)}</td>
                          {(Object.keys(KINDS) as Array<keyof typeof KINDS>).map((k) => (
                            <td key={k} className="num">
                              {m[k].n ? `${KINDS[k].sign < 0 ? '−' : '+'}${inr(m[k].mrr)}` : <span className="adm-muted">·</span>}
                            </td>
                          ))}
                          <td className="num">
                            <b>
                              {net < 0 ? '−' : '+'}
                              {inr(Math.abs(net))}
                            </b>
                          </td>
                          <td className="num">{inr(m.end.mrr)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>

        <section className="erd-card">
          <div className="adm-chart-head">
            <h2>Revenue mix</h2>
            <span className="adm-sub">{num(s.payers)} paying now</span>
          </div>
          <Mix
            title="By plan"
            total={s.payers}
            rows={[
              { key: 'yearly', label: 'Yearly', tone: 't-paid', ...s.byPeriod.yearly },
              { key: 'monthly', label: 'Monthly', tone: 't-trial', ...s.byPeriod.monthly },
              { key: 'unpriced', label: 'Other plans', tone: '', ...s.byPeriod.unpriced },
            ]}
            money={money}
          />
          <Mix
            title="By store"
            total={s.payers}
            rows={[
              { key: 'play', label: 'Google Play', tone: 't-gift', icon: Smartphone, ...s.byStore.play },
              { key: 'web', label: 'Web (Razorpay)', tone: 't-trial', icon: Globe, ...s.byStore.web },
            ]}
            money={money}
          />
          <dl className="adm-dl adm-dl-split" style={{ marginTop: 18 }}>
            <dt>Net MRR after store fees</dt>
            <dd>
              <b>{money(s.netMrr)}</b> <span className="adm-muted">· estimate</span>
            </dd>
            <dt>Fees assumed</dt>
            <dd className="adm-muted">
              Google Play {Math.round(STORE_FEE.play * 100)}% · Razorpay {(STORE_FEE.web * 100).toFixed(2)}% incl. GST
            </dd>
          </dl>
        </section>
      </div>

      <h2 className="adm-section">Health, last 30 days</h2>
      <div className="adm-grid adm-grid-4">
        <Kpi label="Subscriber churn" value={percent(r.logoChurn)} note={`${num(last30.churn.n)} of ${num(last30.start.payers)} stopped paying`} />
        <Kpi label="Revenue churn" value={prices ? percent(r.revenueChurn) : '—'} note={`${money(last30.churn.mrr + last30.contraction.mrr)} MRR lost or downgraded`} />
        <Kpi label="Net MRR retention" value={prices ? percent(r.netRetention) : '—'} note="What last month's payers are worth now. Over 100% beats churn" />
        <Kpi
          label="Lifetime value"
          value={prices && r.ltv ? inr(r.ltv) : '—'}
          note={r.ltv ? 'ARPPU over monthly churn · estimate' : 'Needs at least one churned payer'}
        />
        <Kpi label="Won't renew" value={money(s.cancelling.mrr)} note={`${num(s.cancelling.n)} paid up but cancelled. MRR at risk`} />
        <Kpi label="Payment retrying" value={money(s.grace.mrr)} note={`${num(s.grace.n)} in grace while the store retries`} />
        <Kpi label="Renewals due, 30 days" value={money(s.renewals.amount)} note={`${num(s.renewals.n)} auto-renewing plan${s.renewals.n === 1 ? '' : 's'}, at full price`} />
        <Kpi label="New MRR" value={money(last30.new.mrr + last30.reactivation.mrr)} note={`${num(last30.new.n)} new · ${num(last30.reactivation.n)} came back`} />
      </div>

      <div className="adm-two">
        <section className="erd-card">
          <div className="adm-chart-head">
            <h2>Trial to paid</h2>
            <span className="adm-sub">
              {percent(decided ? converted / decided : null)} overall · median {medianDays === null ? '—' : `${num(medianDays)} days`} to pay
            </span>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Trial started</th>
                  <th className="num">Trials</th>
                  <th className="num">Decided</th>
                  <th className="num">Paid</th>
                  <th>Conversion</th>
                </tr>
              </thead>
              <tbody>
                {[...cohorts].reverse().map((c) => {
                  const rate = c.decided ? c.converted / c.decided : null
                  return (
                    <tr key={c.month.toISOString()}>
                      <td>{monthLabel(c.month, true)}</td>
                      <td className="num">{num(c.started)}</td>
                      <td className="num">{num(c.decided)}</td>
                      <td className="num">{num(c.converted)}</td>
                      <td>
                        <span className="adm-meter adm-tone t-paid">
                          <span className="adm-meter-track">
                            <span className="adm-meter-fill" style={{ width: `${(rate ?? 0) * 100}%` }} />
                          </span>
                          {percent(rate)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="adm-sub" style={{ marginTop: 12 }}>
            Decided means the trial ran out or they paid. Trials still running aren&apos;t counted against the rate.
          </p>
        </section>

        <section className="erd-card">
          <div className="adm-chart-head">
            <h2>Latest purchases</h2>
            <Link className="adm-btn" href="/admin/subscriptions">
              All accounts
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="adm-empty">Nobody has paid yet.</p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <tbody>
                  {recent.map((x) => {
                    const u = users.get(x.userId)
                    const period = periodOf(x)
                    return (
                      <tr key={String(x._id)}>
                        <td>
                          <Link href={`/admin/users/${encodeURIComponent(x.userId)}`} className="adm-user">
                            {(u && displayName(u)) ?? u?.email ?? x.userId}
                          </Link>
                          <div className="adm-muted">
                            {period === 'yearly' ? 'Yearly' : period === 'monthly' ? 'Monthly' : x.basePlanId || x.productId} · {x.store === 'web' ? 'Web' : 'Google Play'}
                          </div>
                        </td>
                        <td>
                          <span className={`adm-badge ${['active', 'cancelled', 'grace'].includes(x.status) ? 'is-good' : ''}`}>{x.status}</span>
                        </td>
                        <td className="num">{period && prices ? inr(prices[period]) : '—'}</td>
                        <td className="num adm-muted" style={{ whiteSpace: 'nowrap' }}>
                          {fmtDate(x.createdAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <p className="adm-sub">
        Amounts use today&apos;s web list price for each plan, Play included, since the store doesn&apos;t tell us what it charged. Past MRR is rebuilt from when each
        purchase started and when it runs out.
      </p>
    </>
  )
}

type MixRow = { key: string; label: string; tone: string; n: number; mrr: number; icon?: LucideIcon }

/** One share bar plus its legend: how payers split, with the MRR each part brings. */
function Mix({ title, rows, total, money }: { title: string; rows: MixRow[]; total: number; money: (paise: number) => string }) {
  const shown = rows.filter((r) => r.n > 0)
  return (
    <div className="adm-mix">
      <h3>{title}</h3>
      {total === 0 ? (
        <p className="adm-empty">Nobody paying yet.</p>
      ) : (
        <>
          <div className="adm-split" role="img" aria-label={shown.map((r) => `${r.label} ${r.n}`).join(', ')}>
            {shown.map((r) => (
              <span key={r.key} className={`adm-tone ${r.tone}`} style={{ flex: r.n }} />
            ))}
          </div>
          <div className="adm-mix-rows">
            {shown.map(({ key, label, tone, n, mrr, icon: Icon }) => (
              <div key={key} className={`adm-tone ${tone}`}>
                <span className="adm-mix-name">
                  <i aria-hidden />
                  {Icon && <Icon size={13} />}
                  {label}
                </span>
                <span className="adm-muted">
                  {num(n)} · {Math.round((n / total) * 100)}%
                </span>
                <b>{money(mrr)}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export const metadata = pageMetadata('/admin/revenue')
