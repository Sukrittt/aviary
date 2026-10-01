import { pageMetadata, pages, SITE_URL } from '@/lib/seo'
import { LandingPage } from '../src/views/LandingPage'


export default function Home() {
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
    <LandingPage />
  </>
}

export const metadata = pageMetadata('/')
