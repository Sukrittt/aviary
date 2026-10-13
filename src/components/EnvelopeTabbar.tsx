'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { InsightsTab } from './InsightsTab'

/**
 * The narrow-viewport tab bar. Desktop navigates from the sidebar; this only
 * appears where the sidebar is hidden, so it carries the same destinations.
 */
const TABS = [
  { href: '/expense', icon: '🏠', label: 'Home' },
  { href: '/expense/envelopes', icon: '✉️', label: 'Categories' },
  { href: '/expense/transactions', icon: '🧾', label: 'Activity' },
  { href: '/insights', icon: '📊', label: 'Insights' },
  { href: '/account', icon: '⚙️', label: 'More' },
]

export function EnvelopeTabbar() {
  const pathname = usePathname() ?? ''
  return (
    <nav className="erd-tabbar" aria-label="Primary">
      {TABS.map((tab) => (
        tab.href === '/insights' ? <InsightsTab key={tab.href} active={pathname === tab.href} /> : <Link key={tab.href} href={tab.href} className={`erd-tab${pathname === tab.href ? ' is-active' : ''}`}>
          <span aria-hidden="true">{tab.icon}</span>
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  )
}
