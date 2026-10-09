import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { pageMetadata } from '@/lib/seo'
import { CurrencyScope } from '@/src/context/CurrencyContext'
import { currencyForCountry } from '@/src/lib/countryCurrency'

export const metadata = pageMetadata('/onboarding')

// The wizard's currency step starts on the visitor's local currency, by
// Vercel's geo header. No header (local dev, unknown IP) keeps the INR default.
export default async function Layout({ children }: { children: ReactNode }) {
  const country = (await headers()).get('x-vercel-ip-country')
  return <CurrencyScope code={currencyForCountry(country)}>{children}</CurrencyScope>
}
