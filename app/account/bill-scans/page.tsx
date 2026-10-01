import { pageMetadata } from '@/lib/seo'
import { BillScansPage } from '../../../src/views/BillScansPage'

export default function Page() {
  return <BillScansPage />
}

export const metadata = pageMetadata('/account/bill-scans')
