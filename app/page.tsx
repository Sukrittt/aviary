import { pageMetadata, pages, SITE_URL } from '@/lib/seo'
import { getPlanPrices } from '@/lib/billing/razorpay'
import { formatPrice } from '@/src/components/billing/copy'
import { LandingPage } from '../src/views/LandingPage'

// Static page with the post-trial price refreshed hourly from Razorpay.
export const revalidate = 3600

async function loadMonthlyPrice(): Promise<string | undefined> {
  try {
    const monthly = (await getPlanPrices())?.find((p) => p.period === 'monthly')
    return monthly && formatPrice(monthly.amount, monthly.currency)
  } catch {
    // Razorpay unreachable: the hero just leaves the price out.
    return undefined
  }
}


export default async function Home() {
  const monthlyPrice = await loadMonthlyPrice()
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
    <LandingPage monthlyPrice={monthlyPrice} />
  </>
}

export const metadata = pageMetadata('/')
