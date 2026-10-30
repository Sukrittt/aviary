'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { InsightsTab } from './InsightsTab'
import { ChartLineIcon, GearIcon, HouseIcon, InvoiceIcon, SquaresFourIcon, type PhosphorIcon } from '@/src/components/icons'

/**
 * The narrow-viewport tab bar. Desktop navigates from the sidebar; this only
 * appears where the sidebar is hidden, so it carries the same destinations.
 */
const TABS: Array<{ href: string; icon: PhosphorIcon; label: string }> = [
  { href: '/expense', icon: HouseIcon, label: 'Home' },
  { href: '/expense/envelopes', icon: SquaresFourIcon, label: 'Categories' },
  { href: '/expense/transactions', icon: InvoiceIcon, label: 'Activity' },
  { href: '/insights', icon: ChartLineIcon, label: 'Insights' },
  { href: '/account', icon: GearIcon, label: 'Account' },
]

export function EnvelopeTabbar() {
  const pathname = usePathname() ?? ''
  return (
    <nav className="erd-tabbar" aria-label="Primary">
      {TABS.map(({ href, icon: Icon, label }) => (
        href === '/insights' ? <InsightsTab key={href} active={pathname === href} /> : <Link key={href} href={href} className={`erd-tab${pathname === href ? ' is-active' : ''}`}>
          <Icon size={22} weight={pathname === href ? 'fill' : 'regular'} aria-hidden />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  )
}
