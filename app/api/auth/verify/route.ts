import { json, error } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { ensureUserById } from '@/lib/users'
import { scheduleWelcomeEmail } from '@/lib/email/welcome'

export const dynamic = 'force-dynamic'

// Unlike the data routes, this must reject a missing/invalid session outright —
// they intentionally fall back to the read-only demo user (200 + sample data) so
// the app stays usable signed out, which makes them useless for the mobile app's
// "is my stored token still good?" check.
export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)
  // Mobile signs in directly against WorkOS (never hits the web callback routes),
  // so this is its only chance to JIT-create the local user row.
  await ensureUserById(auth.userId)
  scheduleWelcomeEmail(auth.userId)
  return json({ ok: true, userId: auth.userId })
}
