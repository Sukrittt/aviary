import { pageMetadata } from '@/lib/seo'
import '../../../src/insights.css'
import { IncomePage } from '../../../src/views/IncomePage'

export default function Page() {
  return <IncomePage />
}

export const metadata = pageMetadata('/account/income')
