import { pageMetadata } from '@/lib/seo'
import { ArchivePage } from '../../../src/views/ArchivePage'

export default function Page() {
  return <ArchivePage />
}

export const metadata = pageMetadata('/account/archive')
