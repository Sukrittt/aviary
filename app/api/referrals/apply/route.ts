import { json, error, readBody } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { isRateLimited } from '@/lib/rateLimit'
import { applyReferral } from '@/lib/referrals'

export const dynamic = 'force-dynamic'

/**
 * Enter a friend's or creator's code by hand, in the first 7 days. Answers an
 * error code, never text: the clients own the copy.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)
  // Guessing codes would otherwise be free.
  if (await isRateLimited(`referral-apply:${auth.userId}`, [{ windowMs: 3_600_000, limit: 10 }])) return error('rate_limited', 429)
  const body = await readBody(req)
  const outcome = await applyReferral(auth.userId, body.code, 'manual')
  if (outcome === 'applied') return json({ ok: true })
  return json({ error: outcome }, { status: outcome === 'not_found' ? 404 : 409 })
}
