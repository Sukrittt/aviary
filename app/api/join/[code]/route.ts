import { json, error } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { invitePreview, joinBudget } from '@/lib/spaceMembers'
import { budgetAction } from '@/lib/spaceRoutes'
import { isRateLimited, clientIp } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

// Codes are 6 characters over 31 letters (~887M), so a cap on guesses is what keeps them secret (#214).
const LIMITS = [{ windowMs: 60_000, limit: 10 }, { windowMs: 86_400_000, limit: 50 }]

/** `GET /api/join/:code`: what the invite is for. No sign-in needed; the code is the secret. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  if (await isRateLimited(`join-preview:ip:${clientIp(req)}`, LIMITS)) return error('rate limited', 429)
  const { code } = await params
  const preview = await invitePreview(code)
  return json(preview, { status: preview.status === 'not_found' ? 404 : 200, headers: { 'Cache-Control': 'private, no-store' } })
}

/**
 * `POST /api/join/:code`: join the budget. `{ spaceId, already }`. Not
 * billing-gated: the owner's plan covers members, and a brand-new person
 * has no trial of their own yet.
 */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const auth = await getAuth(req)
  if (auth.readOnly) return error('sign in to join', 401)
  const guard = readOnlyGuard({ ...auth, spaceDenied: undefined }, 'POST')
  if (guard) return guard
  const [userLimited, ipLimited] = await Promise.all([
    isRateLimited(`join:user:${auth.userId}`, LIMITS),
    isRateLimited(`join:ip:${clientIp(req)}`, LIMITS),
  ])
  if (userLimited || ipLimited) return error('rate limited', 429)
  return budgetAction(() => joinBudget(auth.userId, code))
}
