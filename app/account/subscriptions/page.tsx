import { pageMetadata } from '@/lib/seo'
import '../../../src/insights.css'
import { SubscriptionsPage } from '../../../src/views/SubscriptionsPage'

export default function Page() {
  return <SubscriptionsPage />
}

export const metadata = pageMetadata('/account/subscriptions')
