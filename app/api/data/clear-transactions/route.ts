import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { invalidate } from '@/lib/cache'
import { invalidateCategoryMap } from '@/lib/categoryMap'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  // Wiping every expense is the owner's call in a shared budget, like deleting it.
  if (auth.spaceRole !== 'owner') return error('only the owner can clear this budget', 403)

  const body = await readBody(req)
  if (body.confirm !== true) return error('confirm required', 400)

  const expenses = await getCollection('expenses', auth)
  const result = await expenses.deleteMany({})
  invalidate('expenses', auth.spaceId)
  invalidate('wrapped', auth.spaceId)
  // Every envelope's `spent` figure is derived from expenses, so clearing
  // them all changes every envelope's numbers even though budgets itself
  // wasn't written to.
  invalidate('budgets', auth.spaceId)
  invalidateCategoryMap(auth.spaceId)
  return json({ ok: true, deleted: result.deletedCount })
}
