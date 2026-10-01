import { json, error } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { isRateLimited } from '@/lib/rateLimit'
import { refreshFromProvider, getAccess } from '@/lib/billing/service'
import { BillingProviderError } from '@/lib/billing/providerError'
import { billingFlagsFor } from '@/lib/billing/flags'

export const dynamic = 'force-dynamic'

/**
 * Refresh this account's entitlement from the provider. Called after a
 * purchase, after "Restore purchases", and when a client suspects its cached
 * status is stale.
 *
 * The account refreshed is always the *authenticated* one. The client sends
 * no body, and nothing it could send would be believed: a purchase is
 * confirmed by asking RevenueCat about the user id we already verified, not
 * by reading a receipt the device handed us. Web (Razorpay) purchases on
 * record are re-fetched the same way.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  // Each call is an outbound provider request, so a retry loop on a client
  // turns into a request flood at RevenueCat and Razorpay. Generous enough for a purchase
  // followed by a few manual refreshes.
  if (await isRateLimited(`billing-sync:${auth.userId}`, [{ windowMs: 60_000, limit: 10 }, { windowMs: 3_600_000, limit: 60 }])) {
    return error('too many refreshes, try again shortly', 429)
  }

  const { purchaseEnabled } = await billingFlagsFor(auth.userId)
  try {
    const access = await refreshFromProvider(auth.userId)
    return json({ ...access, purchaseEnabled })
  } catch (err) {
    if (err instanceof BillingProviderError) {
      // The provider is unreachable or erroring. This is an outage, not a
      // cancellation — hand back the access already on record, unchanged, and
      // say the refresh failed. Downgrading someone here would lock a paying
      // user out of their budget because a third party had a bad minute.
      console.error('billing sync: provider unavailable for', auth.userId, err.message)
      return json({ ...(await getAccess(auth.userId)), purchaseEnabled, refreshed: false }, { status: 503 })
    }
    throw err
  }
}
