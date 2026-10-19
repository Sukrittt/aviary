import { getAuth, readOnlyGuard } from '@/lib/access'
import { restoreBudget } from '@/lib/spaceMembers'
import { budgetAction } from '@/lib/spaceRoutes'

export const dynamic = 'force-dynamic'

/** `POST /api/spaces/:id/restore`: bring back a budget deleted in the last 30 days. Owner only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuth(req)
  const guard = readOnlyGuard({ ...auth, spaceDenied: undefined }, 'POST')
  if (guard) return guard
  return budgetAction(() => restoreBudget(auth, id))
}
