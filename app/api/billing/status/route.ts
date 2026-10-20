import { json, error } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { getAccess } from '@/lib/billing/service'
import { billingFlagsFor } from '@/lib/billing/flags'
import { getDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

/**
 * The client's single source of truth for what this account may do, and what
 * to offer it next. Read-only, and served from the locally verified
 * projection — it never calls the payment provider.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  const [access, flags] = await Promise.all([getAccess(auth.userId), billingFlagsFor(auth.userId)])
  // `covered`: the open budget is someone else's, so their plan decides, not
  // this person's. The app stays open (read-only if that plan lapsed, which the
  // budget list flags) while `allowed` still describes the person's own plan.
  // Someone who only joined has no personal budget, so a request naming none
  // (no cookie yet on a new browser) still can't be on their own plan.
  const covered = !auth.spaceDenied && (auth.spaceOwnerId !== auth.userId || (await joinedOnly(auth.userId)))
  return json({ ...access, covered, purchaseEnabled: flags.purchaseEnabled })
}

async function joinedOnly(userId: string): Promise<boolean> {
  const user = await (await getDb()).collection<{ _id: string; noPersonalBudget?: boolean }>('users').findOne({ _id: userId }, { projection: { noPersonalBudget: 1 } })
  return !!user?.noPersonalBudget
}
