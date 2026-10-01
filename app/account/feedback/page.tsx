import { pageMetadata } from '@/lib/seo'
import { FeedbackPage } from '../../../src/views/FeedbackPage'

export default async function Page({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams
  return <FeedbackPage initialType={type === 'idea' ? 'idea' : 'bug'} />
}

export const metadata = pageMetadata('/account/feedback')
