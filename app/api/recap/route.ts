import { json, nowIn, getCollection } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { getDb } from '@/lib/mongodb'
import { EXPENSE_HEADERS, toRow } from '@/lib/models'
import type { UserDoc } from '@/lib/users'
import { computeWeekRecap, onboardedDate, recapDue, recapWindow, type RecapRow } from '@/lib/weekRecap'

export const dynamic = 'force-dynamic'

/**
 * The first-week recap, if this user should see it now. Both clients call
 * this on launch and open the recap on `due: true`. Opening it PATCHes
 * `weekRecapSeen` on /api/user, which turns `due` off on every device.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return json({ due: false })
  const gate = await requireAccess(auth)
  if (gate) return gate

  const db = await getDb()
  const user = await db.collection<UserDoc>('users').findOne({ _id: auth.userId })
  const start = user ? onboardedDate(user) : null
  if (!user || !start || !recapDue(start, user.weekRecapSeenAt, nowIn(user.timezone).date)) return json({ due: false })

  const { end } = recapWindow(start)
  const coll = await getCollection('expenses', auth)
  const docs = await coll.find({ date: { $gte: start, $lte: end } }).toArray()
  return json({ due: true, recap: computeWeekRecap(docs.map((d) => toRow(EXPENSE_HEADERS, d) as RecapRow), start) })
}
