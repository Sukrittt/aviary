import { getDb } from './mongodb'
import { claim, unclaim } from './notifications/deliver'
import { sendPushNotification } from './push'
import type { UserDoc } from './users'

export const CRON_RUNS = 'cron_runs'
export const CRON_JOBS = { notifications: '/api/notifications/run', gc: '/api/cron/gc', billing: '/api/cron/billing', emails: '/api/cron/emails' } as const
export type CronJob = keyof typeof CRON_JOBS

/** Header the admin "Run now" action sends alongside CRON_SECRET, so the run is recorded as manual. */
export const TRIGGER_HEADER = 'x-aviary-trigger'

export interface CronRunDoc {
  job: CronJob
  trigger: 'cron' | 'admin'
  startedAt: Date
  finishedAt: Date
  durationMs: number
  ok: boolean
  result: Record<string, unknown> | null
  error: string | null
}

/** Only call after the CRON_SECRET check passed — the header is trusted from there on. */
export function triggerOf(req: Request): CronRunDoc['trigger'] {
  return req.headers.get(TRIGGER_HEADER) === 'admin' ? 'admin' : 'cron'
}

/**
 * Runs a cron job body and records the outcome in `cron_runs` for /admin/jobs.
 * Recording never fails the job; the job's own error is rethrown after it's recorded.
 */
export async function recordCronRun<T extends Record<string, unknown>>(job: CronJob, trigger: CronRunDoc['trigger'], fn: () => Promise<T>): Promise<T> {
  const startedAt = new Date()
  const save = async (ok: boolean, result: T | null, error: string | null) => {
    const finishedAt = new Date()
    try {
      const db = await getDb()
      await db.collection<CronRunDoc>(CRON_RUNS).insertOne({ job, trigger, startedAt, finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(), ok, result, error })
    } catch (err) {
      console.warn('[cronRuns] could not record run:', (err as Error).message)
    }
  }

  try {
    const result = await fn()
    await save(true, result, null)
    return result
  } catch (err) {
    await save(false, null, (err as Error).message)
    throw err
  }
}

/** A run that threw, or finished with work it could not complete. */
function isBadRun(run: CronRunDoc | null | undefined): boolean {
  return !!run && (!run.ok || Number(run.result?.failed ?? 0) > 0)
}

/**
 * Pushes the admins when `job` goes bad twice in a row. Returns whether
 * anyone was actually notified.
 *
 * `cron_runs` and /admin/jobs are a record, not a signal — nobody opens them
 * until something is already known to be wrong. Billing reconciliation is the
 * repair path for webhooks that never arrived, so it failing quietly means a
 * user whose renewal went missing is locked out of an account they are still
 * paying for, and we hear about it from them.
 *
 * Two runs rather than one: a provider blip repairs itself on the next run,
 * and an alert that fires on every blip stops being read. Claim-deduped per
 * UTC day, so a job that stays broken doesn't re-push on a manual re-run.
 *
 * ponytail: a job that stops running entirely (bad CRON_SECRET → 401 before
 * `recordCronRun`, or Vercel dropping the schedule) records nothing and so
 * alerts nothing. A staleness check on the latest run would catch that —
 * worth adding if a schedule ever does go missing.
 */
export async function alertAdminsOnRepeatFailure(job: CronJob, title: string, problem: string | null): Promise<boolean> {
  if (!problem) return false

  const db = await getDb()
  // [0] is the run that just finished — `recordCronRun` has already inserted it.
  const [, previous] = await db.collection<CronRunDoc>(CRON_RUNS).find({ job }).sort({ startedAt: -1 }).limit(2).toArray()
  if (!isBadRun(previous)) return false

  const key = `cron-alert:${job}:${new Date().toISOString().slice(0, 10)}`
  const admins = await db.collection<UserDoc>('users').find({ isAdmin: true, deleted_at: null }, { projection: { _id: 1 } }).toArray()

  let sent = false
  for (const admin of admins) {
    if (!(await claim(db, admin._id, key))) continue
    try {
      await sendPushNotification({ userId: admin._id, title, body: `Two runs in a row: ${problem}. Check /admin/jobs.` })
      sent = true
    } catch (err) {
      // Same reason as the lifecycle reminders: a burnt claim would silence
      // this alert permanently, which is worse than sending it a day late.
      console.error('cron alert: push failed for', admin._id, key, err)
      await unclaim(db, admin._id, key)
    }
  }
  return sent
}
