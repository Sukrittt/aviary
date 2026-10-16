'use client'

import '@/src/appStyles'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppearance } from '@/components/AppearanceProvider'
import { ExpenseSidebar } from '@/src/components/ExpenseSidebar'
import { InsightsTab } from '@/src/components/InsightsTab'
import { GearIcon, HouseIcon, InvoiceIcon, MoonIcon, SunIcon } from '@/src/components/icons'

export default function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const { theme, setTheme } = useAppearance()

  return (
    <section className="expense-redesign">
      <button type="button" className="erd-theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label="Toggle theme">
        {theme === 'dark' ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
      </button>

      <header className="erd-mobile-header">
        <div className="erd-mobile-greet">
          Account <GearIcon aria-hidden />
        </div>
      </header>

      <div className="erd-main">
        <ExpenseSidebar />
        <main className="erd-content">
          <div className="account-panel">{children}</div>
        </main>
      </div>

      <nav className="erd-tabbar" aria-label="Primary">
        <Link href="/expense" className="erd-tab"><HouseIcon size={22} aria-hidden /><span>Home</span></Link>
        <Link href="/expense/transactions" className="erd-tab"><InvoiceIcon size={22} aria-hidden /><span>Activity</span></Link>
        <InsightsTab />
        <Link href="/account" className={`erd-tab ${pathname.startsWith('/account') ? 'is-active' : ''}`}><GearIcon size={22} weight={pathname.startsWith('/account') ? 'fill' : 'regular'} aria-hidden /><span>More</span></Link>
      </nav>
    </section>
  )
}
