import { error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { getDb } from '@/lib/mongodb'
import { BudgetError, SPACE_MEMBERS } from '@/lib/spaces'
import { removeMember } from '@/lib/spaceMembers'
import { budgetAction } from '@/lib/spaceRoutes'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; userId: string }> }

/**
 * `DELETE /api/spaces/:id/members/:userId`: leave (`me` or your own id) or,
 * for the owner, remove someone. Never billing-gated: leaving is an exit.
 */
export async function DELETE(req: Request, { params }: Params) {
  const { id, userId } = await params
  const auth = await getAuth(req)
  const guard = readOnlyGuard({ ...auth, spaceDenied: undefined }, 'DELETE')
  if (guard) return guard
  return budgetAction(() => removeMember(auth, id, userId === 'me' ? auth.userId : userId))
}

/** `PATCH /api/spaces/:id/members/me` `{ notifyOthers }`: "Tell me when others log". Your own row only. */
export async function PATCH(req: Request, { params }: Params) {
  const { id, userId } = await params
  const auth = await getAuth(req)
  const guard = readOnlyGuard({ ...auth, spaceDenied: undefined }, 'PATCH')
  if (guard) return guard
  if (userId !== 'me' && userId !== auth.userId) return error('only your own settings', 403)
  const body = await readBody(req)
  if (typeof body.notifyOthers !== 'boolean') return error('notifyOthers must be true or false')
  return budgetAction(async () => {
    const res = await (await getDb()).collection(SPACE_MEMBERS).updateOne({ space_id: id, user_id: auth.userId }, { $set: { notify_others: body.notifyOthers } })
    if (res.matchedCount === 0) throw new BudgetError('NOT_FOUND', 'not a member')
    return { notifyOthers: body.notifyOthers }
  })
}
