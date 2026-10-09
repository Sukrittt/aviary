import { headers } from 'next/headers'
import { pageMetadata, pages, SITE_URL } from '@/lib/seo'
import { visitorPlanPrices } from '@/lib/billing/prices'
import { formatPrice } from '@/src/components/billing/copy'
import { LandingPage } from '../src/views/LandingPage'

async function loadMonthlyPrice(): Promise<string | undefined> {
  // Rendered per request: the price depends on the visitor's country.
  const monthly = (await visitorPlanPrices())?.find((p) => p.period === 'monthly')
  return monthly && formatPrice(monthly.amount, monthly.currency)
}

export default async function Home() {
  const monthlyPrice = await loadMonthlyPrice()
  // iPadOS Safari sends a Mac user agent, so iPads still see the Android CTA.
  const h = await headers()
  const ua = h.get('user-agent') ?? ''
  // Same rule as the price: no geo header (local dev) counts as India.
  const country = h.get('x-vercel-ip-country')
  const intl = !!country && country !== 'IN'
  const ios = /iPhone|iPad|iPod/.test(ua)
  const android = /Android/.test(ua)
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Aviary',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Android, Web',
    url: SITE_URL.href,
    image: new URL('/icon.png', SITE_URL).href,
    description: pages['/'].description,
    downloadUrl: 'https://play.google.com/store/apps/details?id=com.sukrit04.envelope',
  }

  return <>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
    />
    <LandingPage monthlyPrice={monthlyPrice} ios={ios} android={android} intl={intl} />
  </>
}

export const metadata = pageMetadata('/')
