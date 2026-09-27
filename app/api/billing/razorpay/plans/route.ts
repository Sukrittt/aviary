import { json, error } from '@/lib/http'
import { getPlanPrices } from '@/lib/billing/razorpay'
import { BillingProviderError } from '@/lib/billing/providerError'

export const dynamic = 'force-dynamic'

/**
 * The web plans and their prices, straight from Razorpay (cached). Public:
 * prices are on the pricing page anyway, and the picker loads this before
 * anyone has decided to buy.
 */
export async function GET() {
  try {
    const prices = await getPlanPrices()
    if (!prices) return error('web checkout is not available', 503)
    return json({ plans: prices })
  } catch (err) {
    if (err instanceof BillingProviderError) return error('prices are unavailable right now', 503)
    throw err
  }
}
