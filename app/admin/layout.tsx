import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/seo'
import { requireAdmin } from '@/lib/admin'
import { AdminNav } from './AdminNav'
import '../../src/expense-redesign.css'
import './admin.css'

export const dynamic = 'force-dynamic'

export const metadata = pageMetadata('/admin')

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin()

  return (
    <section className="expense-redesign">
      <div className="erd-main">
        <AdminNav />
        <main className="erd-content adm">{children}</main>
      </div>
    </section>
  )
}
