import { pageMetadata } from '@/lib/seo'
import Link from 'next/link'
import { ArrowUpRight, Ban, CalendarClock, FlaskConical, Gift, RefreshCw, ShieldCheck, ShieldOff, ShoppingBag, TriangleAlert, UserPlus } from 'lucide-react'
import { getDb } from '@/lib/mongodb'
import { escapeRegExp } from '@/lib/http'
import { getSystemSettings } from '@/lib/systemSettings'
import { displayName, type UserDoc } from '@/lib/users'
import { ADMIN_AUDIT, type AdminAuditDoc } from '@/lib/adminAudit'
import { pickSubscription, resolveAccess, type Access } from '@/lib/billing/access'
import {
  BILLING_ACCOUNTS,
  BILLING_EVENTS,
  BILLING_SUBSCRIPTIONS,
  TRIAL_DAYS,
  type BillingAccountDoc,
  type BillingEventDoc,
  type BillingSubscriptionDoc,
} from '@/lib/billing/records'
import { ActionForm, SubmitButton } from '../ActionForm'
import { DailyBars } from '../DailyBars'
import { RangeTabs } from '../RangeTabs'
import { fmtDate, fmtDateTime, num, parseRange } from '../format'
import { ACTIONS } from '../audit/summarize'
import { ManageDialog } from './ManageDialog'
import { RunwayBars, ToneLegend, type RunwayBucket } from './RunwayBars'
import { STATES, STATE_ORDER, StateBadge, stateOf, type State } from './states'
import { extendTrialAction, grantGiftAction, resyncAction, revokeGiftAction, toggleTesterAction } from './actions'

/**
 * ponytail: resolves every billing account in memory with `resolveAccess` —
 * the same function the app serves users from — so these numbers can never
 * drift from what someone is actually granted. Fine at a few thousand
 * accounts. Past MAX_SCAN, store the resolved mode on the account and count
 * it with an aggregation instead.
 */
const MAX_SCAN = 5000
const LIST_LIMIT = 100
const DAY_MS = 86400000
const RUNWAY_WEEKS = 13
const GRANT_ACTIONS = ['billing.extend_trial', 'billing.gift_grant', 'billing.gift_revoke', 'billing.tester', 'billing.resync']
const IST = 'Asia/Kolkata'

const istDay = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: IST })
const shortDay = (date: Date) => date.toLocaleDateString('en-IN', { timeZone: IST, day: 'numeric', month: 'short' })
const daysUntil = (iso: string | null, now: Date) => (iso ? Math.max(0, Math.floor((new Date(iso).getTime() - now.getTime()) / DAY_MS)) : null)
const zeroCounts = (): Record<State, number> => ({ trial: 0, paid: 0, gift: 0, expired: 0 })

type Params = Promise<{ q?: string; state?: string; user?: string; starts?: string }>

export default async function AdminSubscriptions({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const state = (STATE_ORDER as string[]).includes(params.state ?? '') ? (params.state as State) : ''
  const selectedId = params.user?.trim() ?? ''
  const startDays = parseRange(params.starts)
  const now = new Date()

  const db = await getDb()
  const [accounts, subs, failedEvents, settings, liveUsers, grants] = await Promise.all([
    db.collection<BillingAccountDoc>(BILLING_ACCOUNTS).find().limit(MAX_SCAN).toArray(),
    db.collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS).find().limit(MAX_SCAN).toArray(),
    db.collection<BillingEventDoc>(BILLING_EVENTS).find({ state: 'failed' }).sort({ receivedAt: -1 }).limit(6).toArray(),
    getSystemSettings(),
    db.collection<UserDoc>('users').countDocuments({ deleted_at: null }),
    db.collection<AdminAuditDoc>(ADMIN_AUDIT).find({ action: { $in: GRANT_ACTIONS } }).sort({ at: -1 }).limit(6).toArray(),
  ])

  const ids = [...new Set([...accounts.map((a) => a._id), ...grants.map((g) => g.targetUserId).filter((id): id is string => !!id)])]
  const users = new Map(
    (
      await db
        .collection<UserDoc>('users')
        .find({ _id: { $in: ids } }, { projection: { email: 1, name: 1, firstName: 1, lastName: 1, deleted_at: 1, billingTester: 1 } })
        .toArray()
    ).map((u) => [u._id, u]),
  )

  const subsByUser = new Map<string, BillingSubscriptionDoc[]>()
  for (const s of subs) subsByUser.set(s.userId, [...(subsByUser.get(s.userId) ?? []), s])

  // Accounts whose user doc is gone were hard-deleted; nothing to show or act on.
  const rows = accounts.flatMap((account) => {
    const user = users.get(account._id)
    if (!user) return []
    const access = resolveAccess({ now, account, subscription: pickSubscription(subsByUser.get(account._id) ?? [], now), enforced: true })
    const endsAt = access.gifted ? account.comp!.until.toISOString() : (access.paidExpiresAt ?? access.trialEndsAt)
    return [{ account, user, access, state: stateOf(access), endsAt, daysLeft: daysUntil(endsAt, now) }]
  })
  const live = rows.filter((r) => !r.user.deleted_at)

  const counts = zeroCounts()
  for (const r of live) counts[r.state]++
  const endingSoon = live.filter((r) => r.state === 'trial' && r.access.trialDaysRemaining <= 7).length
  const payers = new Set(subs.map((s) => s.userId))
  const noAccount = Math.max(0, liveUsers - live.length)

  // When access runs out, one bar per week for the next quarter.
  const runway: RunwayBucket[] = Array.from({ length: RUNWAY_WEEKS }, (_, i) => ({
    label: shortDay(new Date(now.getTime() + i * 7 * DAY_MS)),
    counts: zeroCounts(),
    total: 0,
  }))
  for (const r of live) {
    if (r.state === 'expired' || !r.endsAt) continue
    const week = Math.floor((new Date(r.endsAt).getTime() - now.getTime()) / (7 * DAY_MS))
    if (week < 0 || week >= RUNWAY_WEEKS) continue
    runway[week].counts[r.state]++
    runway[week].total++
  }
  const runwayTotals = runway.reduce((acc, b) => {
    for (const s of STATE_ORDER) acc[s] += b.counts[s]
    return acc
  }, zeroCounts())

  const trialStarts = new Map<string, number>()
  for (const r of rows) {
    const day = istDay(r.account.trialStartedAt)
    trialStarts.set(day, (trialStarts.get(day) ?? 0) + 1)
  }

  const plans = [
    ...subs.reduce((map, s) => {
      const key = `${s.productId || 'unknown product'}${s.basePlanId ? ` · ${s.basePlanId}` : ''}|${s.status}`
      return map.set(key, (map.get(key) ?? 0) + 1)
    }, new Map<string, number>()),
  ].sort((a, b) => b[1] - a[1])

  const selected = selectedId ? rows.find((r) => r.account._id === selectedId) : undefined

  const re = q ? new RegExp(escapeRegExp(q), 'i') : null
  const matching = rows
    .filter((r) => (!state || r.state === state) && (!re || re.test(r.user.email) || re.test(displayName(r.user) ?? '') || r.user._id === q))
    // Whoever runs out next is the row worth acting on; accounts already
    // expired sit below, most recently lapsed first.
    .sort((a, b) => (a.state === 'expired' ? 1 : 0) - (b.state === 'expired' ? 1 : 0) || String(a.endsAt).localeCompare(String(b.endsAt)) * (a.state === 'expired' ? -1 : 1))

  const listHref = (over: Record<string, string>) =>
    `/admin/subscriptions?${new URLSearchParams({ ...(q && { q }), ...(state && { state }), ...(params.starts && { starts: params.starts }), ...over })}`
  const closeHref = listHref({})

  return (
    <>
      <div className="adm-head">
        <h1>Subscriptions</h1>
        <div className="adm-status">
          <span className={`adm-chip ${settings.billing.enforced ? 'adm-tone t-paid' : ''}`}>
            {settings.billing.enforced ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
            {settings.billing.enforced ? 'Access enforced' : 'Not enforced'}
          </span>
          <span className={`adm-chip ${settings.billing.purchaseEnabled ? '' : 'is-off'}`}>
            <ShoppingBag size={14} />
            Purchases {settings.billing.purchaseEnabled ? 'on' : 'off'}
          </span>
          <span className={`adm-chip ${settings.billing.audience === 'everyone' ? '' : 'is-off'}`}>
            <FlaskConical size={14} />
            {settings.billing.audience === 'everyone' ? 'Everyone' : 'Testers only'}
          </span>
          <Link className="adm-btn" href="/admin/system">
            System
          </Link>
        </div>
      </div>

      {!settings.billing.enforced && (
        <div className="adm-notice">
          <TriangleAlert size={17} />
          <p>
            Enforcement is off, so everyone keeps full access whatever their state below. These are resolved honestly — this is what would apply the moment the
            switch flips.
          </p>
        </div>
      )}

      <div className="adm-grid adm-grid-4">
        {STATE_ORDER.map((s) => {
          const Icon = STATES[s].icon
          return (
            <div key={s} className={`adm-kpi adm-stat adm-tone t-${s}`}>
              <div className="adm-stat-top">
                <span className="adm-stat-icon">
                  <Icon size={16} />
                </span>
                {counts[s] > 0 && <span className="adm-stat-share">{Math.round((counts[s] / live.length) * 100)}%</span>}
              </div>
              <div className="adm-kpi-value">{num(counts[s])}</div>
              <div className="adm-kpi-label">{STATES[s].label}</div>
              <div className="adm-kpi-note">{s === 'trial' && endingSoon > 0 ? `${num(endingSoon)} end within 7 days` : STATES[s].note}</div>
            </div>
          )
        })}
      </div>

      {live.length > 0 && (
        <div className="adm-share">
          <div className="adm-split" role="img" aria-label={STATE_ORDER.map((s) => `${counts[s]} ${STATES[s].label}`).join(', ')}>
            {STATE_ORDER.filter((s) => counts[s] > 0).map((s) => (
              <span key={s} className={`adm-tone t-${s}`} style={{ flex: counts[s] }} />
            ))}
          </div>
          <ToneLegend counts={counts} of={live.length} />
        </div>
      )}

      <div className="adm-two">
        <section className="erd-card">
          <div className="adm-chart-head">
            <h2>Access running out</h2>
            <span className="adm-sub">Next {RUNWAY_WEEKS} weeks</span>
          </div>
          <RunwayBars buckets={runway} horizonDays={RUNWAY_WEEKS * 7} />
          {runway.some((b) => b.total > 0) && (
            <div style={{ marginTop: 14 }}>
              <ToneLegend counts={runwayTotals} />
            </div>
          )}
        </section>

        <section className="erd-card">
          <div className="adm-chart-head">
            <h2>Signup to purchase</h2>
            <span className="adm-sub">All time</span>
          </div>
          <div className="adm-funnel">
            {(
              [
                { label: 'Signed up', icon: UserPlus, value: liveUsers, tone: 'trial', of: null },
                { label: 'Started a trial', icon: CalendarClock, value: live.length, tone: 'gift', of: liveUsers },
                { label: 'Ever purchased', icon: ShoppingBag, value: payers.size, tone: 'paid', of: live.length },
              ] as const
            ).map(({ label, icon: Icon, value, tone, of }) => (
              <div key={label} className={`adm-funnel-row adm-tone t-${tone}`}>
                <span className="adm-funnel-label">
                  <Icon size={14} /> {label}
                </span>
                <span className="adm-funnel-track">
                  <span className="adm-funnel-fill" style={{ width: `${liveUsers ? Math.max(2, (value / liveUsers) * 100) : 0}%` }} />
                </span>
                <span className="adm-funnel-value">
                  {num(value)}
                  {of ? <em>{of ? `${Math.round((value / of) * 100)}%` : ''}</em> : null}
                </span>
              </div>
            ))}
          </div>
          <p className="adm-sub" style={{ marginTop: 14 }}>
            {num(noAccount)} signed-up account{noAccount === 1 ? '' : 's'} never finished onboarding, so no trial clock has started for them.
          </p>
        </section>
      </div>

      <div className="adm-two">
        <section className="erd-card adm-trial-chart">
          <div className="adm-chart-head">
            <h2>Trials started</h2>
            <RangeTabs param="starts" value={startDays} params={params} />
          </div>
          <DailyBars counts={trialStarts} days={startDays} unit="trials" />
        </section>

        <section className="erd-card">
          <div className="adm-chart-head">
            <h2>Purchases by plan</h2>
            <span className="adm-sub">{num(payers.size)} payer{payers.size === 1 ? '' : 's'}</span>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Store status</th>
                  <th className="num">Purchases</th>
                </tr>
              </thead>
              <tbody>
                {plans.map(([key, n]) => {
                  const [product, status] = key.split('|')
                  const entitling = status === 'active' || status === 'cancelled' || status === 'grace' || status === 'scheduled'
                  return (
                    <tr key={key}>
                      <td className="adm-mono">{product}</td>
                      <td>
                        <span className={`adm-badge ${entitling ? 'is-good' : ''}`}>{status}</span>
                      </td>
                      <td className="num">{num(n)}</td>
                    </tr>
                  )
                })}
                {plans.length === 0 && (
                  <tr>
                    <td colSpan={3} className="adm-empty">
                      Nobody has purchased yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="adm-two">
        <section className="erd-card">
          <h2>Failed provider events</h2>
          <p className="adm-sub" style={{ margin: '-6px 0 14px' }}>
            Webhooks that could not be applied. The billing job retries them; anything lingering here needs a look.
          </p>
          {failedEvents.length === 0 ? (
            <p className="adm-empty">
              <ShieldCheck size={16} /> Every event applied cleanly.
            </p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <tbody>
                  {failedEvents.map((e) => (
                    <tr key={String(e._id)}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.receivedAt)}</td>
                      <td className="adm-mono">{e.type}</td>
                      <td className="adm-muted">{e.userId ? (users.get(e.userId)?.email ?? e.userId) : '—'}</td>
                      <td className="adm-muted">{e.error ?? `${e.attempts} attempt(s)`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="erd-card">
          <h2>Recent access changes</h2>
          <p className="adm-sub" style={{ margin: '-6px 0 14px' }}>
            Trials extended, plans gifted or revoked, testers and re-syncs. Full history in the <Link href="/admin/audit">audit log</Link>.
          </p>
          {grants.length === 0 ? (
            <p className="adm-empty">
              <Gift size={16} /> Nothing has been granted by hand yet.
            </p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <tbody>
                  {grants.map((g) => (
                    <tr key={String(g._id)}>
                      <td>{ACTIONS[g.action]?.label ?? g.action}</td>
                      <td className="adm-muted">{g.targetUserId ? (users.get(g.targetUserId)?.email ?? g.targetUserId) : '—'}</td>
                      <td className="num adm-muted" style={{ whiteSpace: 'nowrap' }}>
                        {fmtDateTime(g.at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="erd-card">
        <div className="adm-chart-head">
          <h2>Accounts</h2>
          <span className="adm-sub">
            {num(matching.length)} matching{matching.length > LIST_LIMIT ? ` · showing ${LIST_LIMIT}` : ''}
          </span>
        </div>

        <form className="adm-form adm-filters" action="/admin/subscriptions" style={{ marginBottom: 16 }}>
          <input className="adm-input adm-search" name="q" type="search" defaultValue={q} placeholder="Email, name or user id" aria-label="Search" />
          <select className="adm-select" name="state" defaultValue={state} aria-label="State">
            <option value="">All states</option>
            {STATE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATES[s].label}
              </option>
            ))}
          </select>
          <button className="adm-btn is-primary" type="submit">
            Search
          </button>
        </form>

        <div className="adm-table-wrap">
          <table className="adm-table adm-accounts">
            <thead>
              <tr>
                <th>User</th>
                <th>State</th>
                <th>Access until</th>
                <th>Remaining</th>
                <th>Plan</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {matching.slice(0, LIST_LIMIT).map(({ account, user, access, state: s, endsAt, daysLeft }) => (
                <tr key={account._id}>
                  <td>
                    <Link href={`/admin/users/${encodeURIComponent(account._id)}`} className="adm-user">
                      {displayName(user) ?? '(no name)'}
                    </Link>
                    <div className="adm-muted">{user.email}</div>
                  </td>
                  <td>
                    <div className="adm-badges">
                      <StateBadge state={s} />
                      {user.deleted_at && <span className="adm-badge is-bad">Deleting</span>}
                      {user.billingTester && <span className="adm-badge">Tester</span>}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(endsAt)}</td>
                  <td>
                    {s === 'expired' ? (
                      <span className="adm-muted">—</span>
                    ) : (
                      <span className={`adm-meter adm-tone t-${s}`}>
                        {s === 'trial' && (
                          <span className="adm-meter-track">
                            <span className="adm-meter-fill" style={{ width: `${Math.min(100, (access.trialDaysRemaining / TRIAL_DAYS) * 100)}%` }} />
                          </span>
                        )}
                        {daysLeft === 0 ? 'last day' : `${num(daysLeft ?? 0)}d`}
                      </span>
                    )}
                  </td>
                  <td className="adm-muted">{s === 'gift' ? (account.comp?.reason ?? 'gifted') : (access.productId || '—')}</td>
                  <td>
                    <Link className="adm-btn" href={listHref({ user: account._id })} scroll={false}>
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {matching.length === 0 && (
                <tr>
                  <td colSpan={6} className="adm-empty">
                    No accounts match {q ? `“${q}”` : 'this filter'}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <ManageDialog
          title={displayName(selected.user) ?? '(no name)'}
          subtitle={selected.user.email}
          badge={<StateBadge state={selected.state} />}
          closeHref={closeHref}
        >
          <ManageBody row={selected} />
        </ManageDialog>
      )}
    </>
  )
}

type Row = { account: BillingAccountDoc; user: UserDoc; access: Access; state: State; endsAt: string | null; daysLeft: number | null }

/** The dialog's contents: what this account has, then what can be done about it. */
function ManageBody({ row: { account, user, access, state, endsAt, daysLeft } }: { row: Row }) {
  const id = account._id

  return (
    <>
      <div className={`adm-runway adm-tone t-${state}`}>
        <div className="adm-runway-head">
          <strong>{state === 'expired' ? 'No access' : `Access until ${fmtDate(endsAt)}`}</strong>
          <span>{state === 'expired' ? 'Locked out once enforcement is on' : daysLeft === 0 ? 'Last day' : `${num(daysLeft ?? 0)} days left`}</span>
        </div>
        {state === 'trial' && (
          <span className="adm-meter-track is-wide">
            <span className="adm-meter-fill" style={{ width: `${Math.min(100, (access.trialDaysRemaining / TRIAL_DAYS) * 100)}%` }} />
          </span>
        )}
      </div>

      <dl className="adm-dl adm-dl-split">
        <dt>Trial window</dt>
        <dd>
          {fmtDate(access.trialStartedAt)} → {fmtDate(access.trialEndsAt)}
        </dd>
        <dt>Store status</dt>
        <dd>{access.renewalState ? `${access.renewalState}${access.productId ? ` · ${access.productId}` : ''}` : 'No purchase on record'}</dd>
        <dt>Gifted plan</dt>
        <dd>{account.comp ? `Until ${fmtDate(account.comp.until)} — ${account.comp.reason}` : 'None'}</dd>
        <dt>Deletion deadline</dt>
        <dd>{access.retentionDeadline ? fmtDate(access.retentionDeadline) : 'None set'}</dd>
      </dl>

      <div className="adm-group">
        <h3>
          <CalendarClock size={13} /> Extend the trial
        </h3>
        <ActionForm action={extendTrialAction.bind(null, id)}>
          <label className="adm-field">
            <span>Days</span>
            <input className="adm-input" name="days" type="number" min={1} max={365} defaultValue={14} />
          </label>
          <SubmitButton>Extend</SubmitButton>
          <span className="adm-hint">Adds to what is left, or starts from today if it already ran out.</span>
        </ActionForm>
      </div>

      <div className="adm-group">
        <h3>
          <Gift size={13} /> {account.comp ? 'Gifted plan' : 'Gift a plan'}
        </h3>
        <ActionForm action={grantGiftAction.bind(null, id)} confirm="Give this user a free plan? They get full access with no purchase.">
          <label className="adm-field">
            <span>Months</span>
            <input className="adm-input" name="months" type="number" min={1} max={120} defaultValue={12} />
          </label>
          <input className="adm-input adm-grow" name="reason" placeholder="Reason, e.g. early supporter" maxLength={140} />
          <SubmitButton variant="primary">{account.comp ? 'Add months' : 'Gift plan'}</SubmitButton>
        </ActionForm>
        {account.comp && (
          <ActionForm action={revokeGiftAction.bind(null, id)} confirm="Revoke the gifted plan? They fall back to whatever else grants them access.">
            <SubmitButton variant="danger">
              <Ban size={14} /> Revoke gift
            </SubmitButton>
            <span className="adm-hint">Granted {fmtDate(account.comp.grantedAt)}, runs to {fmtDate(account.comp.until)}.</span>
          </ActionForm>
        )}
      </div>

      <div className="adm-group">
        <h3>
          <RefreshCw size={13} /> Account
        </h3>
        <ActionForm action={resyncAction.bind(null, id)}>
          <SubmitButton>Re-sync purchases</SubmitButton>
          <span className="adm-hint">Re-checks RevenueCat now — for a purchase a webhook missed.</span>
        </ActionForm>
        <ActionForm action={toggleTesterAction.bind(null, id)}>
          <SubmitButton>{user.billingTester ? 'Remove from testers' : 'Make a billing tester'}</SubmitButton>
          <span className="adm-hint">
            {user.billingTester ? 'The billing switches apply to this account.' : 'While the audience is “testers only”, the switches skip this account.'}
          </span>
        </ActionForm>
      </div>

      <Link className="adm-dialog-foot" href={`/admin/users/${encodeURIComponent(id)}`}>
        Open the full user record <ArrowUpRight size={15} />
      </Link>
    </>
  )
}

export const metadata = pageMetadata('/admin/subscriptions')
