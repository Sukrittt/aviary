'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppearance } from '@/components/AppearanceProvider'
import { ExpenseSidebar } from '@/src/components/ExpenseSidebar'
import '../../src/expense-redesign.css'

export default function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const { theme, setTheme } = useAppearance()

  return (
    <section className="expense-redesign">
      <button type="button" className="erd-theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label="Toggle theme">
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      <header className="erd-mobile-header">
        <div className="erd-mobile-greet">
          Account <span>⚙️</span>
        </div>
      </header>

      <div className="erd-main">
        <ExpenseSidebar />
        <main className="erd-content">
          <div className="account-panel">{children}</div>
        </main>
      </div>

      <nav className="erd-tabbar" aria-label="Primary">
        <Link href="/expense" className="erd-tab"><span aria-hidden="true">🏠</span><span>Home</span></Link>
        <Link href="/expense/transactions" className="erd-tab"><span aria-hidden="true">🧾</span><span>Activity</span></Link>
        <Link href="/insights" className="erd-tab"><span aria-hidden="true">📊</span><span>Insights</span></Link>
        <Link href="/account" className={`erd-tab ${pathname.startsWith('/account') ? 'is-active' : ''}`}><span aria-hidden="true">⚙️</span><span>More</span></Link>
      </nav>
    </section>
  )
}
