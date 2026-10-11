import { pageMetadata } from '@/lib/seo'
import '../../../src/insights.css'
import { AccountsPage } from '../../../src/views/AccountsPage'

export default function Page() {
  return <AccountsPage />
}

export const metadata = pageMetadata('/account/accounts')
