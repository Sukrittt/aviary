import type { Db } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import { COLLECTIONS } from '@/lib/models'
import { nowIn } from '@/lib/http'
import { sendPushNotification } from '@/lib/push'
import type { UserDoc } from '@/lib/users'
import { isSubscriptionDueToday } from '@/lib/subscriptions'
import { claim, unclaim } from './deliver'

/**
 * Evening check: a push at the end of the user's own day when nothing is
 * logged for it yet. New users forget, the backlog piles up, and they quit by
 * day 3; this is the nudge that keeps the streak going.
 *
 * Decided here on the server at send time, not scheduled on the device: an
 * expense logged on web has to stop the phone's nudge, and only the server
 * sees both. Always on, no setting.
 *
 * Hobby crons run once a day and anywhere within their hour, so vercel.json
 * calls /api/cron/evening-check from 24 daily crons, one per UTC hour. A two
 * hour window always contains at least one run whatever the jitter or
 * half-hour offset, and the claim makes sure only the first one sends.
 */

const WINDOW_START_HOUR = 20
const WINDOW_END_HOUR = 22

const COPY: Array<{ title: string; body: string }> = [
  { title: 'Quiet day?', body: 'You haven\'t logged anything today. Got a minute?' },
  { title: 'Day\'s almost done', body: 'Log today\'s spends before bed. You\'ll thank yourself.' },
  { title: 'Anything today?', body: 'Even your chai counts. Log it while you remember.' },
]

/** The user's local date when it's their evening window, else null. Unset or unknown zones are IST, same as `nowIn`. */
export function eveningDateFor(tz: string | undefined, at: Date): string | null {
  const { date, timestamp } = nowIn(tz, at)
  const hour = Number(timestamp.slice(11, 13))
  return hour >= WINDOW_START_HOUR && hour < WINDOW_END_HOUR ? date : null
}

/** One line per day, rotating, so it doesn't read the same every evening. */
export function eveningCopy(date: string): { title: string; body: string } {
  const day = Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000)
  return COPY[day % COPY.length]
}

/**
 * Whether the nightly cron (notifications/run, 03:00 UTC) still owes this user
 * an auto-added expense today. That cron lands in the evening for the
 * Americas, so without this a recurring charge due today could arrive just
 * after we nudged "nothing logged". Mirrors its skips: no category, no add.
 */
async function autoAddDueToday(db: Db, userId: string, date: string): Promise<boolean> {
  const live = { user_id: userId, deleted_at: null, category: { $nin: [null, ''] } }
  const recurring = await db
    .collection(COLLECTIONS.recurringExpenses)
    .findOne({ ...live, status: 'active', next_run_date: { $lte: date } }, { projection: { _id: 1 } })
  if (recurring) return true
  const subs = await db.collection(COLLECTIONS.subscriptions).find(live).toArray()
  const due = subs.filter((sub) =>
    isSubscriptionDueToday(
      {
        nextDueDate: String(sub.next_due_date ?? ''),
        billingCycle: String(sub.billing_cycle ?? ''),
        renewalOrEndMonth: sub.renewal_or_end_month ? String(sub.renewal_or_end_month) : undefined,
        timestamp: String(sub.timestamp ?? ''),
        status: sub.status ? String(sub.status) : undefined,
      },
      date,
    ),
  )
  if (due.length === 0) return false
  // next_due_date doesn't advance after the auto-add, so a sub still reads as due
  // once it's been added (and maybe deleted). Its push claim marks it done.
  const keys = [...new Set(due.map((sub) => `sub-expense:${String(sub.service)}:${date}`))]
  const added = await db.collection(COLLECTIONS.notificationLog).countDocuments({ user_id: userId, key: { $in: keys } })
  return added < keys.length
}

/**
 * Bypasses `scoped()` like the other crons: cross-tenant, and it only reads
 * fields that aren't encrypted. Any live expense dated today counts as
 * logged, including recurring and subscription auto-adds, and so does one
 * that's due to be auto-added later today.
 *
 * ponytail: one user at a time, same as notifications/run. Batch the expense
 * lookup into one aggregation if the push-token population outgrows a run.
 */
export async function runEveningCheck(at = new Date()): Promise<{ sent: number; failed: number }> {
  const db = await getDb()
  const withDevice = await db.collection(COLLECTIONS.pushTokens).distinct('user_id')
  const users = await db
    .collection<UserDoc>('users')
    .find({ _id: { $in: withDevice }, deleted_at: null }, { projection: { timezone: 1 } })
    .toArray()

  let sent = 0
  let failed = 0
  for (const user of users) {
    const date = eveningDateFor(user.timezone, at)
    if (!date) continue
    try {
      const logged = await db
        .collection(COLLECTIONS.expenses)
        .findOne({ user_id: user._id, date, deleted_at: null }, { projection: { _id: 1 } })
      if (logged || (await autoAddDueToday(db, user._id, date))) continue

      const key = `evening-check:${date}`
      if (!(await claim(db, user._id, key))) continue
      try {
        // Zero means every device's ticket failed: release the claim so the next run in the window retries.
        if ((await sendPushNotification({ userId: user._id, ...eveningCopy(date), data: { route: '/modals/log-expense' } })) > 0) sent++
        else {
          failed++
          await unclaim(db, user._id, key)
        }
      } catch (err) {
        console.error('evening-check: push failed for', user._id, err)
        failed++
        await unclaim(db, user._id, key)
      }
    } catch (err) {
      console.error('evening-check: failed for', user._id, err)
      failed++
    }
  }
  return { sent, failed }
}
