import { json, error, readBody } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { isRateLimited } from '@/lib/rateLimit'
import { getAccess } from '@/lib/billing/service'
import { billingFlagsFor } from '@/lib/billing/flags'
import { BillingProviderError } from '@/lib/billing/providerError'
import { createPayPalSubscription, paypalConfig } from '@/lib/billing/paypal'
import type { PlanPeriod } from '@/lib/billing/razorpay'
import { defersFirstCharge } from '@/src/components/billing/copy'

export const dynamic = 'force-dynamic'

/**
 * Start PayPal checkout: create the subscription for the signed-in user and
 * hand back PayPal's approval page. PayPal sends the buyer back to the
 * account page, which asks the verify route to confirm it.
 *
 * Nothing is granted here, same as the Razorpay route. The same guards apply:
 * rate limit, purchases open, one paid plan per account, trial days kept.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  if (await isRateLimited(`billing-subscribe:${auth.userId}`, [{ windowMs: 60_000, limit: 5 }, { windowMs: 3_600_000, limit: 20 }])) {
    return error('too many attempts, try again shortly', 429)
  }

  const { purchaseEnabled } = await billingFlagsFor(auth.userId)
  if (!purchaseEnabled) return error('purchases are not open yet', 403)

  const config = paypalConfig()
  if (!config) return error('web checkout is not available', 503)

  const body = await readBody(req)
  const period = body.period
  if (period !== 'monthly' && period !== 'yearly') return error('period must be monthly or yearly', 400)

  const access = await getAccess(auth.userId)
  if (access.mode === 'paid' && !access.gifted) {
    return json({ error: 'already_subscribed', store: access.store, paidExpiresAt: access.paidExpiresAt }, { status: 409 })
  }

  const startAt = access.mode === 'trial' && access.trialEndsAt && defersFirstCharge(access.trialEndsAt) ? new Date(access.trialEndsAt) : null
  const origin = new URL(req.url).origin

  try {
    const { approveUrl } = await createPayPalSubscription({
      planId: config.plans[period as PlanPeriod],
      userId: auth.userId,
      startAt,
      returnUrl: `${origin}/account?checkout=paypal`,
      cancelUrl: `${origin}/account?checkout=paypal-cancelled`,
    })
    return json({ approveUrl })
  } catch (err) {
    if (err instanceof BillingProviderError) {
      console.error('billing subscribe: PayPal unavailable for', auth.userId, err.message)
      return error('checkout is unavailable right now', 503)
    }
    throw err
  }
}
