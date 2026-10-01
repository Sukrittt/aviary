import { pageMetadata } from '@/lib/seo'
import '../../../src/expense-redesign.css'
import { EnvelopesPage } from '../../../src/views/EnvelopesPage'

export default function Page() {
  return <EnvelopesPage />
}

export const metadata = pageMetadata('/expense/envelopes')
