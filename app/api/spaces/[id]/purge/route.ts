import { getAuth, readOnlyGuard } from '@/lib/access'
import { purgeBudget } from '@/lib/spaceMembers'
import { budgetAction } from '@/lib/spaceRoutes'

export const dynamic = 'force-dynamic'

/** `POST /api/spaces/:id/purge`: delete an already-deleted budget for good, data and all. Owner only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuth(req)
  const guard = readOnlyGuard({ ...auth, spaceDenied: undefined }, 'POST')
  if (guard) return guard
  return budgetAction(() => purgeBudget(auth, id))
}
