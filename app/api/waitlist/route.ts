import { json, error, readBody, EMAIL_RE } from '@/lib/http'
import { getDb } from '@/lib/mongodb'
import { isRateLimited, clientIp } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

const PLATFORMS = ['ios']

/**
 * Public, unauthenticated: the landing page's "tell me when it's on iPhone"
 * form. An email already on the list is answered without writing anything.
 * New and repeat signups get the same `{ ok, email }` response, so the form
 * can't be used to check who's already on the list.
 */
export async function POST(req: Request) {
  const body = await readBody(req)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return error('a valid email is required')
  const platform = typeof body.platform === 'string' ? body.platform : ''
  if (!PLATFORMS.includes(platform)) return error('unknown platform')

  const limited = await isRateLimited(`waitlist:ip:${clientIp(req)}`, [
    { windowMs: 60 * 1000, limit: 5 },
    { windowMs: 60 * 60 * 1000, limit: 20 },
  ])
  if (limited) return error('rate limited', 429)

  const waitlist = (await getDb()).collection('waitlist')
  if (!(await waitlist.findOne({ email, platform }, { projection: { _id: 1 } }))) {
    try {
      await waitlist.insertOne({ email, platform, createdAt: new Date() })
    } catch (e) {
      // A concurrent signup for the same email won the race; the unique index caught it.
      if ((e as { code?: number }).code !== 11000) throw e
    }
  }
  return json({ ok: true, email })
}
