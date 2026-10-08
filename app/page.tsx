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
  const ios = /iPhone|iPad|iPod/.test((await headers()).get('user-agent') ?? '')
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
    <LandingPage monthlyPrice={monthlyPrice} ios={ios} />
  </>
}

export const metadata = pageMetadata('/')
