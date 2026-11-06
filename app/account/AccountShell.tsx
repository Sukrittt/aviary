'use client'

import '@/src/appStyles'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppearance } from '@/components/AppearanceProvider'
import { ExpenseSidebar } from '@/src/components/ExpenseSidebar'
import { InsightsTab } from '@/src/components/InsightsTab'
import { CaretLeftIcon, GearIcon, HouseIcon, InvoiceIcon, MoonIcon, SunIcon } from '@/src/components/icons'

/** Settings pages reached from the Account hub: they get a way back to it. The
 *  planning pages (Recurring, Subscriptions, Income) are sidebar destinations, and
 *  Import and the guided tour are full flows with their own back control. */
const SETTINGS_PAGES = ['accounts', 'archive', 'bill-scans', 'changelog', 'chat-history', 'data', 'features', 'feedback', 'help', 'ideas', 'refer', 'security']

/** Headers for the settings pages that render none of their own. */
const HEADERS: Record<string, { eyebrow: string; title: string; subtitle: string }> = {
  security: { eyebrow: 'Account', title: 'Account & security', subtitle: 'Your name, how you sign in, and where you are signed in.' },
  data: { eyebrow: 'Account', title: 'Your data', subtitle: 'Download everything you have logged, and choose what we measure.' },
  features: { eyebrow: 'Account', title: 'Features', subtitle: 'Hide the parts of Aviary you do not use.' },
  help: { eyebrow: 'Support', title: 'Help & feedback', subtitle: 'How Aviary works, and how to reach us.' },
  feedback: { eyebrow: 'Support', title: 'Report a bug', subtitle: 'Tell us what went wrong. It goes straight to us, not the public board.' },
  changelog: { eyebrow: 'Support', title: 'Changelog', subtitle: 'New features, improvements, and fixes for the web app.' },
  ideas: { eyebrow: 'Support', title: 'Feedback board', subtitle: 'Post an idea or vote on what we build next.' },
}

export default function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const { theme, setTheme } = useAppearance()
  const sub = pathname.match(/^\/account\/([^/]+)/)?.[1] ?? ''
  const header = HEADERS[sub]

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
          <div className={`account-panel${SETTINGS_PAGES.includes(sub) ? ' is-settings' : ''}`}>
            {SETTINGS_PAGES.includes(sub) && (
              <Link href="/account" className="account-back">
                <CaretLeftIcon size={14} aria-hidden="true" /> Account
              </Link>
            )}
            {header && (
              <header className="txn-page-header account-header">
                <div className="txn-page-heading">
                  <span className="txn-page-eyebrow">{header.eyebrow}</span>
                  <h1>{header.title}</h1>
                  <p>{header.subtitle}</p>
                </div>
              </header>
            )}
            {children}
          </div>
        </main>
      </div>

      <nav className="erd-tabbar" aria-label="Primary">
        <Link href="/expense" className="erd-tab"><HouseIcon size={22} aria-hidden /><span>Home</span></Link>
        <Link href="/expense/transactions" className="erd-tab"><InvoiceIcon size={22} aria-hidden /><span>Activity</span></Link>
        <InsightsTab />
        <Link href="/account" className={`erd-tab ${pathname.startsWith('/account') ? 'is-active' : ''}`}><GearIcon size={22} weight={pathname.startsWith('/account') ? 'fill' : 'regular'} aria-hidden /><span>Account</span></Link>
      </nav>
    </section>
  )
}
