import { pageMetadata } from '@/lib/seo'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CURRENCIES, resolveCurrency } from '@/src/lib/currencies'
import { prefsFor } from '@/lib/notifications/rules'
import { getDb } from '@/lib/mongodb'
import { COLLECTIONS } from '@/lib/models'
import { purgesAt } from '@/lib/archive'
import { ADMIN_AUDIT, type AdminAuditDoc } from '@/lib/adminAudit'
import { AI_USAGE, type AiUsageDoc } from '@/lib/ai/usage'
import { displayName, type UserDoc } from '@/lib/users'
import { getWorkOSClient } from '@/lib/workosClient'
import { daysAgo, fmtDate, fmtDateTime, num, timeAgo, usd } from '../../format'
import { ActionForm, SubmitButton } from '../../ActionForm'
import { hardDeleteAction, restoreAction, revokeSessionsAction, softDeleteAction, updateUserAction } from './actions'

/** WorkOS view of the account. Fails soft: a user purged from WorkOS still has a local doc worth inspecting. */
async function loadWorkOS(userId: string) {
  try {
    const workos = getWorkOSClient().userManagement
    const [identities, sessions] = await Promise.all([workos.getUserIdentities(userId), workos.listSessions(userId)])
    return { providers: identities.map((i) => i.provider), sessions: sessions.data.filter((s) => s.status === 'active'), error: null }
  } catch (err) {
    return { providers: [], sessions: [], error: (err as Error).message }
  }
}

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const userId = decodeURIComponent((await params).id)
  const db = await getDb()
  const user = await db.collection<UserDoc>('users').findOne({ _id: userId })
  if (!user) notFound()

  const [workos, counts, notifications, auditRows, aiByFeature] = await Promise.all([
    loadWorkOS(userId),
    Promise.all(
      Object.values(COLLECTIONS).map(async (name) => {
        const coll = db.collection(name)
        const [live, archived] = await Promise.all([
          coll.countDocuments({ user_id: userId, deleted_at: null }),
          coll.countDocuments({ user_id: userId, deleted_at: { $ne: null } }),
        ])
        return { name, live, archived }
      }),
    ),
    db.collection<{ key: string; sentAt: Date }>(COLLECTIONS.notificationLog).find({ user_id: userId }).sort({ sentAt: -1 }).limit(15).toArray(),
    db.collection<AdminAuditDoc>(ADMIN_AUDIT).find({ targetUserId: userId }).sort({ at: -1 }).limit(15).toArray(),
    db
      .collection<AiUsageDoc>(AI_USAGE)
      .aggregate<{ _id: string; calls: number; errors: number; cost: number }>([
        { $match: { user_id: userId, at: { $gte: daysAgo(30) } } },
        { $group: { _id: '$feature', calls: { $sum: 1 }, errors: { $sum: { $cond: ['$ok', 0, 1] } }, cost: { $sum: { $ifNull: ['$costUsd', 0] } } } },
        { $sort: { calls: -1 } },
      ])
      .toArray(),
  ])

  const prefs = prefsFor(user)
  const flag = (value: boolean) => (value ? 'on' : 'off')

  return (
    <>
      <div className="adm-head">
        <div>
          <Link href="/admin/users" className="adm-sub">
            ← Users
          </Link>
          <h1>{displayName(user) ?? '(no name)'}</h1>
          <div className="adm-sub">{user.email}</div>
        </div>
        <div>
          {user.deleted_at ? <span className="adm-badge is-bad">Deleting {fmtDate(purgesAt(user.deleted_at))}</span> : <span className="adm-badge is-good">Active</span>}{' '}
          {user.isAdmin && <span className="adm-badge is-warn">Admin</span>}
        </div>
      </div>

      <div className="adm-two">
        <section className="erd-card">
          <h2>Profile</h2>
          <dl className="adm-dl">
            <dt>User id</dt>
            <dd className="adm-mono">{user._id}</dd>
            <dt>Email verified</dt>
            <dd>{user.emailVerified === false ? 'No' : 'Yes'}</dd>
            <dt>Joined</dt>
            <dd>{fmtDateTime(user.createdAt)}</dd>
            <dt>Last active</dt>
            <dd>
              {timeAgo(user.lastSeenAt)} <span className="adm-muted">{fmtDateTime(user.lastSeenAt)}</span>
            </dd>
            <dt>Onboarded</dt>
            <dd>{fmtDateTime(user.onboardedAt)}</dd>
            <dt>Currency</dt>
            <dd>{user.currencyCode ?? '—'}</dd>
            <dt>Digest</dt>
            <dd>{prefs.cadence}</dd>
            <dt>Alerts</dt>
            <dd>
              thresholds {flag(prefs.thresholds)} · bills {flag(prefs.bills)} ({prefs.billLeadDays}d before) · coach {flag(prefs.coach)} · wrapped {flag(prefs.wrapped)}
            </dd>
            <dt>Sign-in methods</dt>
            <dd>{workos.providers.join(', ') || '—'}</dd>
          </dl>
          {workos.error && <p className="adm-msg is-error">WorkOS: {workos.error}</p>}
        </section>

        <section className="erd-card">
          <h2>Data</h2>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Collection</th>
                <th className="num">Live</th>
                <th className="num">Archived</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.name}>
                  <td className="adm-mono">{c.name}</td>
                  <td className="num">{num(c.live)}</td>
                  <td className="num">{c.archived ? num(c.archived) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="erd-card">
        <h2>Active sessions</h2>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Started</th>
              <th>Method</th>
              <th>Device</th>
            </tr>
          </thead>
          <tbody>
            {workos.sessions.map((s) => (
              <tr key={s.id}>
                <td>{fmtDateTime(s.createdAt)}</td>
                <td>{s.authMethod}</td>
                <td className="adm-muted">{s.userAgent ?? '—'}</td>
              </tr>
            ))}
            {workos.sessions.length === 0 && (
              <tr>
                <td colSpan={3} className="adm-muted">
                  No active sessions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ marginTop: 14 }}>
          <ActionForm action={revokeSessionsAction.bind(null, userId)} confirm="Sign this user out of every device?">
            <SubmitButton>Revoke all sessions</SubmitButton>
          </ActionForm>
        </div>
      </section>

      <section className="erd-card">
        <h2>AI usage · 30d</h2>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th className="num">Calls</th>
              <th className="num">Errors</th>
              <th className="num">Cost</th>
            </tr>
          </thead>
          <tbody>
            {aiByFeature.map((f) => (
              <tr key={f._id}>
                <td>{f._id}</td>
                <td className="num">{num(f.calls)}</td>
                <td className="num">{f.errors ? num(f.errors) : '—'}</td>
                <td className="num">{usd(f.cost)}</td>
              </tr>
            ))}
            {aiByFeature.length === 0 && (
              <tr>
                <td colSpan={4} className="adm-muted">
                  No AI calls in the last 30 days.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="erd-card">
        <h2>Edit</h2>
        <ActionForm action={updateUserAction.bind(null, userId)} className="adm-form" key={JSON.stringify(prefs) + user.name}>
          <input className="adm-input" name="name" defaultValue={user.name ?? ''} placeholder="Name" />
          <select className="adm-select" name="currencyCode" defaultValue={resolveCurrency(user.currencyCode)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
          <label className="adm-sub">
            Digest{' '}
            <select className="adm-select" name="notifyCadence" defaultValue={prefs.cadence}>
              <option value="off">off</option>
              <option value="weekly">weekly</option>
              <option value="daily">daily</option>
            </select>
          </label>
          <label className="adm-sub">
            Bill lead days <input className="adm-input" name="notifyBillLeadDays" type="number" min={0} max={30} defaultValue={prefs.billLeadDays} style={{ width: 70 }} />
          </label>
          {(
            [
              ['notifyThresholds', prefs.thresholds],
              ['notifyBills', prefs.bills],
              ['notifyCoach', prefs.coach],
              ['notifyWrapped', prefs.wrapped],
            ] as const
          ).map(([f, on]) => (
            <label key={f} className="adm-sub">
              <input type="checkbox" name={f} defaultChecked={on} /> {f.replace('notify', '')}
            </label>
          ))}
          <SubmitButton variant="primary">Save</SubmitButton>
        </ActionForm>
      </section>

      <div className="adm-two">
        <section className="erd-card">
          <h2>Recent notifications</h2>
          <table className="adm-table">
            <tbody>
              {notifications.map((n) => (
                <tr key={n.key}>
                  <td className="adm-mono">{n.key}</td>
                  <td className="num">{fmtDateTime(n.sentAt)}</td>
                </tr>
              ))}
              {notifications.length === 0 && (
                <tr>
                  <td className="adm-muted">None in the last 90 days.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="erd-card">
          <h2>Admin history</h2>
          <table className="adm-table">
            <tbody>
              {auditRows.map((a) => (
                <tr key={String(a._id)}>
                  <td>{a.action}</td>
                  <td className="num">{fmtDateTime(a.at)}</td>
                </tr>
              ))}
              {auditRows.length === 0 && (
                <tr>
                  <td className="adm-muted">No admin actions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <section className="erd-card" style={{ borderColor: 'var(--tk-coral)' }}>
        <h2>Danger zone</h2>
        <div className="adm-form" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          {user.deleted_at ? (
            <ActionForm action={restoreAction.bind(null, userId)} confirm="Restore this account and all its archived data?">
              <SubmitButton>Restore account</SubmitButton>
            </ActionForm>
          ) : (
            <ActionForm action={softDeleteAction.bind(null, userId)} confirm="Schedule this account for deletion? It stays restorable until the GC cron purges it.">
              <SubmitButton variant="danger">Schedule deletion (recoverable)</SubmitButton>
            </ActionForm>
          )}
          <ActionForm action={hardDeleteAction.bind(null, userId)} confirm="Permanently delete this account now? This cannot be undone.">
            <input className="adm-input" name="confirmEmail" placeholder={`Type ${user.email} to confirm`} autoComplete="off" style={{ minWidth: 300 }} />
            <SubmitButton variant="danger">Delete permanently now</SubmitButton>
          </ActionForm>
        </div>
      </section>
    </>
  )
}

export const metadata = pageMetadata('/admin/users/[id]')
