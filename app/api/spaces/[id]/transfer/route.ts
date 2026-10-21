import { error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { transferOwnership } from '@/lib/spaceMembers'
import { budgetAction } from '@/lib/spaceRoutes'

export const dynamic = 'force-dynamic'

/** `POST /api/spaces/:id/transfer` `{ to }`: make another member the owner (and payer). Owner only, never the personal budget. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuth(req)
  const guard = readOnlyGuard({ ...auth, spaceDenied: undefined }, 'POST')
  if (guard) return guard
  const body = await readBody(req)
  if (typeof body.to !== 'string' || !body.to) return error('who to hand it to is required')
  return budgetAction(() => transferOwnership(auth, id, body.to as string))
}
