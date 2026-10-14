import Link from 'next/link'
import { BirdMark } from './BirdMark'
import { ExpenseSidebar } from './ExpenseSidebar'
import { HomeSkeleton } from './TabSkeleton'
import { InsightsTab } from '@/src/components/InsightsTab'
import { GearIcon, HouseIcon, InvoiceIcon } from '@/src/components/icons'

/** Real navigation shell shown while `/expense`'s core queries are in flight. */
export function ExpensePageLoading() {
  return (
    <section className="expense-redesign">
      <header className="erd-mobile-header">
        <div className="erd-mobile-greet"><BirdMark size={30} /> Aviary</div>
      </header>

      <div className="erd-main">
        <ExpenseSidebar />
        <div className="erd-content">
          <HomeSkeleton />
        </div>
      </div>

      <nav className="erd-tabbar" aria-label="Primary">
        <Link href="/expense" className="erd-tab"><HouseIcon size={22} aria-hidden /><span>Home</span></Link>
        <Link href="/expense/transactions" className="erd-tab"><InvoiceIcon size={22} aria-hidden /><span>Activity</span></Link>
        <button type="button" className="erd-tab-fab" disabled aria-label="Log expense">+</button>
        <InsightsTab />
        <Link href="/account" className="erd-tab"><GearIcon size={22} aria-hidden /><span>More</span></Link>
      </nav>
    </section>
  )
}
