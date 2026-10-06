import { pageMetadata } from '@/lib/seo'
import { getDb } from '@/lib/mongodb'
import { COLLECTIONS } from '@/lib/models'
import { CRON_JOBS, CRON_RUNS, type CronJob, type CronRunDoc } from '@/lib/cronRuns'
import type { UserDoc } from '@/lib/users'
import { ActionForm, SubmitButton } from '../ActionForm'
import { fmtDateTime, timeAgo } from '../format'
import { runJobAction } from './actions'

const JOBS: Array<{ job: CronJob; label: string; schedule: string; confirm: string }> = [
  {
    job: 'notifications',
    label: 'Notifications & auto-entries',
    schedule: 'Daily 03:00 UTC',
    confirm: 'Run notifications now? This sends real pushes and logs due recurring/subscription expenses for every user.',
  },
  { job: 'gc', label: 'Garbage collection', schedule: 'Daily 04:00 UTC', confirm: 'Run GC now? Archived rows and accounts past their grace window are purged permanently.' },
  {
    job: 'billing',
    label: 'Billing reconciliation',
    schedule: 'Daily 05:00 UTC',
    confirm: 'Reconcile billing now? Re-verifies lapsing subscriptions and failed webhook events against RevenueCat. Safe to run any time.',
  },
  {
    job: 'emails',
    label: 'Transactional email delivery',
    schedule: 'Daily 06:00 UTC',
    confirm: 'Retry pending welcome and subscription emails now? Sends real service emails to eligible accounts.',
  },
  {
    job: 'eveningCheck',
    label: 'Evening check',
    schedule: 'Hourly (24 daily crons)',
    confirm: 'Run the evening check now? Sends a real push to anyone in their 20:00 to 22:00 window with nothing logged today.',
  },
]

export default async function AdminJobs() {
  const db = await getDb()
  const runs = db.collection<CronRunDoc>(CRON_RUNS)
  const [latest, history, notifications] = await Promise.all([
    Promise.all(JOBS.map(({ job }) => runs.findOne({ job }, { sort: { startedAt: -1 } }))),
    // The evening check alone runs 24 times a day.
    runs.find().sort({ startedAt: -1 }).limit(200).toArray(),
    db.collection<{ user_id: string; key: string; sentAt: Date }>(COLLECTIONS.notificationLog).find().sort({ sentAt: -1 }).limit(50).toArray(),
  ])

  const emails = new Map(
    (
      await db
        .collection<UserDoc>('users')
        .find({ _id: { $in: [...new Set(notifications.map((n) => n.user_id))] } }, { projection: { email: 1 } })
        .toArray()
    ).map((u) => [u._id, u.email]),
  )

  return (
    <>
      <div className="adm-head">
        <h1>Jobs</h1>
        <span className="adm-sub">Vercel crons · run history kept 180 days</span>
      </div>

      <div className="adm-two">
        {JOBS.map(({ job, label, schedule, confirm }, i) => {
          const last = latest[i]
          // A run that returned while leaving accounts unreconciled is not "ok" —
          // the badge read `last.ok` alone, so 47 failed accounts showed green.
          const failed = Number(last?.result?.failed ?? 0)
          const needsReview = Number(last?.result?.needs_review ?? 0)
          const healthy = last?.ok && failed === 0 && needsReview === 0 && last?.result?.configured !== false
          return (
            <section key={job} className="erd-card">
              <h2>{label}</h2>
              <dl className="adm-dl" style={{ marginBottom: 14 }}>
                <dt>Route</dt>
                <dd className="adm-mono">{CRON_JOBS[job]}</dd>
                <dt>Schedule</dt>
                <dd>{schedule}</dd>
                <dt>Last run</dt>
                <dd>
                  {last ? (
                    <>
                      {timeAgo(last.startedAt)} ·{' '}
                      {healthy ? (
                        <span className="adm-badge is-good">ok</span>
                      ) : (
                        <span className="adm-badge is-bad">{needsReview > 0 ? `${needsReview} need review` : last?.result?.configured === false ? 'not configured' : failed > 0 ? `${failed} failed` : 'failed'}</span>
                      )}{' '}
                      · {(last.durationMs / 1000).toFixed(1)}s
                    </>
                  ) : (
                    'never recorded'
                  )}
                </dd>
              </dl>
              <ActionForm action={runJobAction.bind(null, job)} confirm={confirm}>
                <SubmitButton>Run now</SubmitButton>
              </ActionForm>
            </section>
          )
        })}
      </div>

      <section className="erd-card">
        <h2>Run history</h2>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Job</th>
                <th>Trigger</th>
                <th>Status</th>
                <th className="num">Duration</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={String(r._id)}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.startedAt)}</td>
                  <td>{r.job}</td>
                  <td>{r.trigger}</td>
                  <td>{r.ok ? <span className="adm-badge is-good">ok</span> : <span className="adm-badge is-bad">failed</span>}</td>
                  <td className="num">{(r.durationMs / 1000).toFixed(1)}s</td>
                  <td className="adm-mono adm-muted">{r.error ?? JSON.stringify(r.result)}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={6} className="adm-muted">
                    No runs recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="erd-card">
        <h2>Recent notifications</h2>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Sent</th>
                <th>User</th>
                <th>Key</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => (
                <tr key={String(n._id)}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(n.sentAt)}</td>
                  <td>{emails.get(n.user_id) ?? n.user_id}</td>
                  <td className="adm-mono">{n.key}</td>
                </tr>
              ))}
              {notifications.length === 0 && (
                <tr>
                  <td colSpan={3} className="adm-muted">
                    None in the last 90 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

export const metadata = pageMetadata('/admin/jobs')
