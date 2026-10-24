import { json, error } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { referralSummary } from '@/lib/referrals'
import { SITE_URL } from '@/lib/seo'

export const dynamic = 'force-dynamic'

/** Your code, share link and how your referrals are doing. Makes the code on first ask. */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)
  // Production links always point at the public site; staging and local share their own.
  const origin = process.env.VERCEL_ENV === 'production' ? SITE_URL.origin : new URL(req.url).origin
  return json(await referralSummary(auth.userId, origin))
}
