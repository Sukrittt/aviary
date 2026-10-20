import { Suspense } from 'react'
import Link from 'next/link'
import { useAppearance } from '../../components/AppearanceProvider'
import { TransactionsView } from '../components/TransactionsView'
import { ExpenseSidebar } from '../components/ExpenseSidebar'
import { LoadingCaption } from '../components/LoadingCaption'
import { InsightsTab } from '@/src/components/InsightsTab'
import { GearIcon, HouseIcon, InvoiceIcon, MoonIcon, SunIcon } from '@/src/components/icons'

export function TransactionsPage() {
  const { theme, setTheme } = useAppearance()

  return (
    <section className="expense-redesign">
      <button
        type="button"
        className="erd-theme-toggle"
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
      </button>

      <header className="erd-mobile-header">
        <div className="erd-mobile-greet">
          Activity <InvoiceIcon aria-hidden />
        </div>
        <div className="erd-mobile-sub">
          <span>Every transaction you’ve logged</span>
        </div>
      </header>

      <div className="erd-main">
        <ExpenseSidebar />
        <div className="erd-content txn-page">
          <Suspense fallback={<div className="txn-timeline"><LoadingCaption placement="page" /></div>}>
            <TransactionsView />
          </Suspense>
        </div>
      </div>

      <nav className="erd-tabbar" aria-label="Primary">
        <Link href="/expense" className="erd-tab">
          <HouseIcon size={22} aria-hidden />
          <span>Home</span>
        </Link>
        <Link href="/expense/transactions" className="erd-tab is-active">
          <InvoiceIcon size={22} weight="fill" aria-hidden />
          <span>Activity</span>
        </Link>
        <InsightsTab />
        <Link href="/account" className="erd-tab">
          <GearIcon size={22} aria-hidden />
          <span>More</span>
        </Link>
      </nav>
    </section>
  )
}
