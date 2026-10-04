import { json, error, readBody } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { isRateLimited } from '@/lib/rateLimit'
import { getAccess } from '@/lib/billing/service'
import { billingFlagsFor } from '@/lib/billing/flags'
import { BillingProviderError } from '@/lib/billing/providerError'
import { createSubscription, razorpayConfig, type PlanPeriod } from '@/lib/billing/razorpay'

export const dynamic = 'force-dynamic'

/**
 * Start web checkout: create a Razorpay subscription for the signed-in user
 * and hand the browser what Checkout needs to open.
 *
 * Nothing is granted here. Access only moves once the payment is verified
 * (the verify route) or Razorpay tells us it settled (the webhook).
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  // Each call creates a subscription at Razorpay. A double-clicked button is
  // fine; a loop is not.
  if (await isRateLimited(`billing-subscribe:${auth.userId}`, [{ windowMs: 60_000, limit: 5 }, { windowMs: 3_600_000, limit: 20 }])) {
    return error('too many attempts, try again shortly', 429)
  }

  const { purchaseEnabled } = await billingFlagsFor(auth.userId)
  if (!purchaseEnabled) return error('purchases are not open yet', 403)

  const config = razorpayConfig()
  if (!config) return error('web checkout is not available', 503)

  const body = await readBody(req)
  const period = body.period
  if (period !== 'monthly' && period !== 'yearly') return error('period must be monthly or yearly', 400)

  // One paid plan per account. Someone already covered, on Google Play or
  // here, would otherwise be billed twice for the same thing. A gifted plan
  // doesn't count: buying on top of a gift is a choice we let them make.
  const access = await getAccess(auth.userId)
  if (access.mode === 'paid' && !access.gifted) {
    return json({ error: 'already_subscribed', store: access.store, paidExpiresAt: access.paidExpiresAt }, { status: 409 })
  }

  // Mid-trial, the first charge waits for the trial to end, so subscribing
  // early doesn't throw away the days left. Too close to the end to be worth
  // a separate mandate step, it just charges now.
  const trialEnd = access.mode === 'trial' && access.trialEndsAt ? new Date(access.trialEndsAt) : null
  const startAt = trialEnd && trialEnd.getTime() > Date.now() + 15 * 60_000 ? trialEnd : null

  try {
    const subscription = await createSubscription(config.plans[period as PlanPeriod], period as PlanPeriod, auth.userId, startAt)
    return json({ subscriptionId: subscription.id, keyId: config.keyId })
  } catch (err) {
    if (err instanceof BillingProviderError) {
      console.error('billing subscribe: Razorpay unavailable for', auth.userId, err.message)
      return error('checkout is unavailable right now', 503)
    }
    throw err
  }
}
