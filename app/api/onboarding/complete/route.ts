import { json, error } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { getDb } from '@/lib/mongodb'
import { completeOnboarding, getAccess } from '@/lib/billing/service'
import { serializeUser, type UserDoc } from '@/lib/users'

export const dynamic = 'force-dynamic'

/**
 * Finish onboarding and start the 30-day trial.
 *
 * Takes no body. The completion instant and the trial dates are the
 * server's, and the action refuses unless the initial budget setup is
 * actually persisted — otherwise a bare POST would mint a trial for an
 * account that never set anything up, and a fresh account could farm a new
 * clock on demand.
 *
 * Idempotent: calling it again returns the same dates.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  const db = await getDb()
  const result = await completeOnboarding(db, auth.userId)
  if (!result.ok) return error('initial budget setup not found', 409)

  // The updated profile comes back too, so the client can seed its `user`
  // cache in one step rather than firing a second request to learn the
  // onboardedAt it just caused.
  const [user, access] = await Promise.all([
    db.collection<UserDoc>('users').findOne({ _id: auth.userId }),
    getAccess(auth.userId),
  ])
  return json({ onboardedAt: result.onboardedAt, user: serializeUser(user), access })
}
