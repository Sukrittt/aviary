import { headers } from 'next/headers'
import { getPlanPrices, type PlanPrice } from './razorpay'

/** Razorpay's plans are INR, so visitors outside India see these fixed USD prices instead (cents). */
export const INTL_PRICES: PlanPrice[] = [
  { period: 'monthly', amount: 490, currency: 'USD' },
  { period: 'yearly', amount: 4900, currency: 'USD' },
]

/**
 * The plan prices for this visitor, by Vercel's geo header. No header (local
 * dev, unknown IP) counts as India. Null when Razorpay isn't configured or is
 * unreachable, so the page can say so rather than fail.
 */
export async function visitorPlanPrices(): Promise<PlanPrice[] | null> {
  const country = (await headers()).get('x-vercel-ip-country')
  if (country && country !== 'IN') return INTL_PRICES
  try {
    return await getPlanPrices()
  } catch {
    return null
  }
}
