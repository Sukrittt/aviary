import { json, error } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { invitePreview, joinBudget } from '@/lib/spaceMembers'
import { budgetAction } from '@/lib/spaceRoutes'

export const dynamic = 'force-dynamic'

/** `GET /api/join/:code`: what the invite is for. No sign-in needed; the code is the secret. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
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
  return budgetAction(() => joinBudget(auth.userId, code))
}
