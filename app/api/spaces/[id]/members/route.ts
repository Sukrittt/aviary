import { json, error } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { getDb } from '@/lib/mongodb'
import { listBudgets, SPACE_MEMBERS, type SpaceMemberDoc } from '@/lib/spaces'
import { listInvites } from '@/lib/spaceMembers'
import { ownerLapsed } from '@/lib/billing/guard'

export const dynamic = 'force-dynamic'

/** `GET /api/spaces/:id/members`: who's in it, your own "tell me when others log", and (owner only) pending invites. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)
  const budget = (await listBudgets(auth.userId)).budgets.find((b) => b.id === id)
  if (!budget) return json({ error: 'NOT_A_MEMBER', spaceId: id }, { status: 403 })
  const me = await (await getDb()).collection<SpaceMemberDoc>(SPACE_MEMBERS).findOne({ space_id: id, user_id: auth.userId })
  // Owner only: whose plan is lapsed, so handing the budget to them is a warned choice, not a surprise lock.
  const members =
    budget.role === 'owner'
      ? await Promise.all(budget.members.map(async (m) => (m.userId === auth.userId ? m : { ...m, lapsed: await ownerLapsed(m.userId) })))
      : budget.members
  return json(
    { members, role: budget.role, notifyOthers: me?.notify_others ?? false, invites: budget.role === 'owner' ? await listInvites(id) : [] },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
