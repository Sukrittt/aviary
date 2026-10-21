import { json, error } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { sharedBudgetsOwnedBy } from '@/lib/spaceMembers'

export const dynamic = 'force-dynamic'

/** `GET /api/user/shared-budgets`: the shared budgets you own, for account deletion's "hand it to…" step. */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)
  return json({ budgets: await sharedBudgetsOwnedBy(auth.userId) }, { headers: { 'Cache-Control': 'private, no-store' } })
}
