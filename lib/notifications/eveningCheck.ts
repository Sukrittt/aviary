import { getDb } from '@/lib/mongodb'
import { COLLECTIONS } from '@/lib/models'
import { nowIn } from '@/lib/http'
import { sendPushNotification } from '@/lib/push'
import type { UserDoc } from '@/lib/users'
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
  { title: 'Quiet day?', body: 'Nothing logged today. Got a minute to catch up?' },
  { title: 'Day\'s almost done', body: 'Log today\'s spends before bed. Takes a minute.' },
  { title: 'Anything today?', body: 'Even a chai counts. Log it while you remember.' },
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
 * Bypasses `scoped()` like the other crons: cross-tenant, and it only reads
 * `date`, which isn't encrypted. Any live expense dated today counts as
 * logged, including recurring and subscription auto-adds.
 */
export async function runEveningCheck(at = new Date()): Promise<{ sent: number }> {
  const db = await getDb()
  const withDevice = await db.collection(COLLECTIONS.pushTokens).distinct('user_id')
  const users = await db
    .collection<UserDoc>('users')
    .find({ _id: { $in: withDevice }, deleted_at: null }, { projection: { timezone: 1 } })
    .toArray()

  let sent = 0
  for (const user of users) {
    const date = eveningDateFor(user.timezone, at)
    if (!date) continue
    try {
      const logged = await db
        .collection(COLLECTIONS.expenses)
        .findOne({ user_id: user._id, date, deleted_at: null }, { projection: { _id: 1 } })
      if (logged) continue

      const key = `evening-check:${date}`
      if (!(await claim(db, user._id, key))) continue
      try {
        await sendPushNotification({ userId: user._id, ...eveningCopy(date), data: { route: '/modals/log-expense' } })
        sent++
      } catch (err) {
        console.error('evening-check: push failed for', user._id, err)
        await unclaim(db, user._id, key)
      }
    } catch (err) {
      console.error('evening-check: failed for', user._id, err)
    }
  }
  return { sent }
}
