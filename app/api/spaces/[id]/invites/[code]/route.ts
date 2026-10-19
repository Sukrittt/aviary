import { getAuth, readOnlyGuard } from '@/lib/access'
import { cancelInvite } from '@/lib/spaceMembers'
import { budgetAction } from '@/lib/spaceRoutes'

export const dynamic = 'force-dynamic'

/** `DELETE /api/spaces/:id/invites/:code`: cancel a pending invite. Owner only. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; code: string }> }) {
  const { id, code } = await params
  const auth = await getAuth(req)
  const guard = readOnlyGuard({ ...auth, spaceDenied: undefined }, 'DELETE')
  if (guard) return guard
  return budgetAction(() => cancelInvite(auth, id, code))
}
