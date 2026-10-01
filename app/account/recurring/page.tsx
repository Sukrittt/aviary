import { pageMetadata } from '@/lib/seo'
import '../../../src/insights.css'
import { RecurringPage } from '../../../src/views/RecurringPage'

export default function Page() {
  return <RecurringPage />
}

export const metadata = pageMetadata('/account/recurring')
