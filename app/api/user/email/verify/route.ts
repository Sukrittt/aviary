import { json, error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { getDb } from '@/lib/mongodb'
import { getWorkOSClient } from '@/lib/workosClient'
import { isRateLimited } from '@/lib/rateLimit'
import type { UserDoc } from '@/lib/users'

export const dynamic = 'force-dynamic'

const RATE_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT = 10

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  if (await isRateLimited(`user-email-verify:${auth.userId}`, [{ windowMs: RATE_WINDOW_MS, limit: RATE_LIMIT }])) {
    return error('rate limited', 429)
  }

  const body = await readBody(req)
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (!code) return error('code required')

  try {
    const { user } = await getWorkOSClient().userManagement.verifyEmail({ userId: auth.userId, code })
    const db = await getDb()
    await db.collection<UserDoc>('users').updateOne({ _id: auth.userId }, { $set: { emailVerified: user.emailVerified } })
    return json({ emailVerified: user.emailVerified })
  } catch {
    return error('invalid or expired code', 401)
  }
}
