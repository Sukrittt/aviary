import { json, error, readBody } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { isRateLimited } from '@/lib/rateLimit'
import { getAccess, recordRazorpaySubscription, SubscriptionOwnerError } from '@/lib/billing/service'
import { billingFlagsFor } from '@/lib/billing/flags'
import { BillingProviderError } from '@/lib/billing/providerError'
import { razorpayConfig, verifyCheckoutSignature } from '@/lib/billing/razorpay'

export const dynamic = 'force-dynamic'

/**
 * Checkout finished in the browser. Confirm it and write the result down.
 *
 * Two independent checks, neither of which trusts the browser's word: the
 * checkout signature (only Razorpay and we hold the secret it's made with),
 * then a fresh fetch of the subscription from Razorpay, which is what
 * actually decides access and must name this user as its owner.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  if (await isRateLimited(`billing-verify:${auth.userId}`, [{ windowMs: 60_000, limit: 10 }])) {
    return error('too many attempts, try again shortly', 429)
  }

  const config = razorpayConfig()
  if (!config) return error('web checkout is not available', 503)

  const body = await readBody(req)
  const paymentId = typeof body.paymentId === 'string' ? body.paymentId : ''
  const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId : ''
  const signature = typeof body.signature === 'string' ? body.signature : ''
  if (!paymentId || !subscriptionId || !signature) return error('paymentId, subscriptionId and signature are required', 400)
  if (!verifyCheckoutSignature(paymentId, subscriptionId, signature, config.keySecret)) return error('invalid signature', 400)

  const { purchaseEnabled } = await billingFlagsFor(auth.userId)
  try {
    const access = await recordRazorpaySubscription(auth.userId, subscriptionId)
    return json({ ...access, purchaseEnabled })
  } catch (err) {
    if (err instanceof SubscriptionOwnerError) return error('this subscription belongs to another account', 403)
    if (err instanceof BillingProviderError) {
      // Paid, but we couldn't confirm it this second. Same contract as sync:
      // the existing access, unchanged, and the webhook finishes the job.
      console.error('billing verify: Razorpay unavailable for', auth.userId, err.message)
      return json({ ...(await getAccess(auth.userId)), purchaseEnabled, refreshed: false }, { status: 503 })
    }
    throw err
  }
}
