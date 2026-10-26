import { headers } from 'next/headers'
import { pages, SITE_URL } from '@/lib/seo'
import { planPricesFor } from '@/lib/billing/prices'
import { formatPrice, PLAY_STORE_URL } from '@/src/components/billing/copy'
import { landingFaqs } from '@/src/components/landing/faqs'
import { jsonLd } from '@/src/components/JsonLd'
import { isIntlCountry } from '@/lib/market'
import { LandingPage } from './LandingPage'

/**
 * `/` (India, ₹) and `/intl` (everyone else, $). Each market has its own URL so
 * search engines index both: Googlebot crawls from the US, so picking the
 * variant by IP would hide the India page. The geo header only decides whether
 * to point the visitor at the other market's page, never redirects.
 */
export async function LandingRoute({ intl }: { intl: boolean }) {
  // ponytail: /intl prices as a US visitor; per-country prices need a URL per country.
  const prices = await planPricesFor(intl ? 'US' : 'IN')
  const monthly = prices?.find((p) => p.period === 'monthly')
  const monthlyPrice = monthly && formatPrice(monthly.amount, monthly.currency)
  const h = await headers()
  // iPadOS Safari sends a Mac user agent, so iPads still see the Android CTA.
  const ua = h.get('user-agent') ?? ''
  const country = h.get('x-vercel-ip-country')
  const otherMarket = intl ? country === 'IN' : isIntlCountry(country)
  const url = new URL(intl ? '/intl' : '/', SITE_URL).href
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL.href}#org`,
        name: 'Aviary',
        url: SITE_URL.href,
        logo: new URL('/icon.png', SITE_URL).href,
        sameAs: [PLAY_STORE_URL],
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Aviary',
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Android, Web',
        url,
        image: new URL('/og.png', SITE_URL).href,
        description: pages[intl ? '/intl' : '/'].description,
        downloadUrl: PLAY_STORE_URL,
        publisher: { '@id': `${SITE_URL.href}#org` },
        // No aggregateRating: the Play listing has no public rating yet.
        ...(prices?.length && {
          offers: prices.map((p) => ({
            '@type': 'Offer',
            name: p.period === 'monthly' ? 'Monthly plan' : 'Yearly plan',
            price: String(p.amount / 100),
            priceCurrency: p.currency,
            url: new URL('/legal/pricing', SITE_URL).href,
          })),
        }),
      },
      {
        '@type': 'FAQPage',
        mainEntity: landingFaqs(intl, monthlyPrice).map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      },
    ],
  }

  return <>
    {jsonLd(structuredData)}
    <LandingPage monthlyPrice={monthlyPrice} ios={/iPhone|iPad|iPod/.test(ua)} android={/Android/.test(ua)} intl={intl} otherMarket={otherMarket} />
  </>
}
