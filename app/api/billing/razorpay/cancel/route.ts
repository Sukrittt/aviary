import { scheduleSubscriptionEmails } from '@/lib/email/subscription'
import { json, error } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { getDb } from '@/lib/mongodb'
import { isRateLimited } from '@/lib/rateLimit'
import { cancelRazorpayRow, getAccess } from '@/lib/billing/service'
import { billingFlagsFor } from '@/lib/billing/flags'
import { BillingProviderError } from '@/lib/billing/providerError'
import { BILLING_SUBSCRIPTIONS, type BillingSubscriptionDoc } from '@/lib/billing/records'

export const dynamic = 'force-dynamic'

/**
 * Turn off renewal for the user's web subscription. Access carries on to the
 * end of the cycle they've paid for; nothing is refunded here.
 *
 * Only web subscriptions: a Google Play one can only be cancelled in Play,
 * and pretending otherwise would leave someone believing they'd stopped a
 * charge that's still coming.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  if (await isRateLimited(`billing-cancel:${auth.userId}`, [{ windowMs: 60_000, limit: 5 }])) {
    return error('too many attempts, try again shortly', 429)
  }

  const db = await getDb()
  const rows = await db
    .collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS)
    .find({ userId: auth.userId, provider: 'razorpay', status: { $in: ['active', 'grace'] }, cancelAtPeriodEnd: { $ne: true } })
    .toArray()
  if (rows.length === 0) return error('no renewing web subscription', 404)

  const { purchaseEnabled } = await billingFlagsFor(auth.userId)
  try {
    for (const row of rows) await cancelRazorpayRow(db, row)
    scheduleSubscriptionEmails()
    return json({ ...(await getAccess(auth.userId)), purchaseEnabled })
  } catch (err) {
    if (err instanceof BillingProviderError) {
      console.error('billing cancel: Razorpay unavailable for', auth.userId, err.message)
      return error('cancelling is unavailable right now', 503)
    }
    throw err
  }
}
