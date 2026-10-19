import { json, error } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { getAccess } from '@/lib/billing/service'
import { billingFlagsFor } from '@/lib/billing/flags'

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
  const covered = !auth.spaceDenied && auth.spaceOwnerId !== auth.userId
  return json({ ...access, covered, purchaseEnabled: flags.purchaseEnabled })
}
