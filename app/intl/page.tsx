import { pageMetadata } from '@/lib/seo'
import { LandingRoute } from '@/src/views/LandingRoute'

export default function IntlHome() {
  return LandingRoute({ intl: true })
}

export const metadata = pageMetadata('/intl')
