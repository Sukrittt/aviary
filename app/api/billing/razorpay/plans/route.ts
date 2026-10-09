import { json, error } from '@/lib/http'
import { plansFor } from '@/lib/billing/prices'
import { BillingProviderError } from '@/lib/billing/providerError'

export const dynamic = 'force-dynamic'

/**
 * The web plans, their prices, and who sells them to this visitor: Razorpay
 * in India, PayPal elsewhere (cached either way). Public: prices are on the
 * pricing page anyway, and the picker loads this before anyone has decided
 * to buy.
 */
export async function GET(req: Request) {
  try {
    const { provider, plans } = await plansFor(req.headers.get('x-vercel-ip-country'))
    if (!plans) return error('web checkout is not available', 503)
    return json({ plans, provider })
  } catch (err) {
    if (err instanceof BillingProviderError) return error('prices are unavailable right now', 503)
    throw err
  }
}
