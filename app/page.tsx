import { pageMetadata } from '@/lib/seo'
import { LandingRoute } from '../src/views/LandingRoute'

export default function Home() {
  return LandingRoute({ intl: false })
}

export const metadata = pageMetadata('/')
