import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireOwnPlan } from '@/lib/billing/guard'
import { createInvite } from '@/lib/spaceMembers'
import { budgetAction } from '@/lib/spaceRoutes'

export const dynamic = 'force-dynamic'

/** `POST /api/spaces/:id/invites`: a fresh code and link, good for 7 days. Owner only, on their own plan. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuth(req)
  const guard = readOnlyGuard({ ...auth, spaceDenied: undefined }, 'POST')
  if (guard) return guard
  const gate = await requireOwnPlan(auth)
  if (gate) return gate
  return budgetAction(() => createInvite(auth, id))
}
