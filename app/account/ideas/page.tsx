import { pageMetadata } from '@/lib/seo'
import { IdeasBoardPage } from '../../../src/views/IdeasBoardPage'

export default function Page() {
  return <IdeasBoardPage />
}

export const metadata = pageMetadata('/account/ideas')
