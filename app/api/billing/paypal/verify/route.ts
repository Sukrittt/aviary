import { json, error, readBody } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { isRateLimited } from '@/lib/rateLimit'
import { getAccess, recordPayPalSubscription, SubscriptionOwnerError } from '@/lib/billing/service'
import { billingFlagsFor } from '@/lib/billing/flags'
import { BillingProviderError } from '@/lib/billing/providerError'
import { paypalConfig } from '@/lib/billing/paypal'

export const dynamic = 'force-dynamic'

/**
 * The buyer is back from PayPal. The `subscription_id` in the return URL is
 * only a pointer: the subscription is fetched from PayPal again, and must
 * name this user as its owner, before anything is written.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  if (await isRateLimited(`billing-verify:${auth.userId}`, [{ windowMs: 60_000, limit: 10 }])) {
    return error('too many attempts, try again shortly', 429)
  }

  if (!paypalConfig()) return error('web checkout is not available', 503)

  const body = await readBody(req)
  const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId : ''
  if (!subscriptionId) return error('subscriptionId is required', 400)

  const { purchaseEnabled } = await billingFlagsFor(auth.userId)
  try {
    const access = await recordPayPalSubscription(auth.userId, subscriptionId)
    return json({ ...access, purchaseEnabled })
  } catch (err) {
    if (err instanceof SubscriptionOwnerError) return error('this subscription belongs to another account', 403)
    if (err instanceof BillingProviderError) {
      // Approved, but we couldn't confirm it this second. The webhook finishes the job.
      console.error('billing verify: PayPal unavailable for', auth.userId, err.message)
      return json({ ...(await getAccess(auth.userId)), purchaseEnabled, refreshed: false }, { status: 503 })
    }
    throw err
  }
}
