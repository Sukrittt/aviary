import { headers } from 'next/headers'
import { getPlanPrices, type PlanPrice } from './razorpay'
import { getPayPalPlanPrices, paypalConfig } from './paypal'

/**
 * Shown to visitors outside India while PayPal checkout isn't configured
 * (cents). Once it is, they see PayPal's own plan prices instead.
 */
export const INTL_PRICES: PlanPrice[] = [
  { period: 'monthly', amount: 499, currency: 'USD' },
  { period: 'yearly', amount: 4999, currency: 'USD' },
]

export type CheckoutProvider = 'razorpay' | 'paypal'

/**
 * Who sells to a visitor from `country` (Vercel's `x-vercel-ip-country`).
 * Razorpay on this account only takes domestic payments, so everyone outside
 * India goes to PayPal once it's set up. No header (local dev, unknown IP)
 * counts as India.
 */
export function checkoutProviderFor(country: string | null): CheckoutProvider {
  return country && country !== 'IN' && paypalConfig() ? 'paypal' : 'razorpay'
}

/** Who sells to this visitor, by Vercel's geo header. */
export async function visitorCheckoutProvider(): Promise<CheckoutProvider> {
  return checkoutProviderFor((await headers()).get('x-vercel-ip-country'))
}

/**
 * The plans and prices a visitor from `country` would be charged. Null when
 * that provider isn't configured; throws when it can't be reached.
 */
export async function plansFor(country: string | null): Promise<{ provider: CheckoutProvider; plans: PlanPrice[] | null }> {
  const provider = checkoutProviderFor(country)
  return { provider, plans: provider === 'paypal' ? await getPayPalPlanPrices() : await getPlanPrices() }
}

/**
 * The plan prices for this visitor, by Vercel's geo header. Null when the
 * provider isn't configured or is unreachable, so the page can say so rather
 * than fail.
 */
export async function visitorPlanPrices(): Promise<PlanPrice[] | null> {
  return planPricesFor((await headers()).get('x-vercel-ip-country'))
}

/** visitorPlanPrices for a given country, for pages that are pinned to one market (/ is India, /intl isn't). */
export async function planPricesFor(country: string | null): Promise<PlanPrice[] | null> {
  if (country && country !== 'IN' && !paypalConfig()) return INTL_PRICES
  try {
    return (await plansFor(country)).plans
  } catch {
    return null
  }
}
