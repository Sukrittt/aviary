import { pageMetadata } from '@/lib/seo'
import { FeedbackPage } from '../../../src/views/FeedbackPage'

export default function Page() {
  return <FeedbackPage />
}

export const metadata = pageMetadata('/account/feedback')
