import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/seo'
import AccountShell from './AccountShell'

export const metadata = pageMetadata('/account')

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>
}
