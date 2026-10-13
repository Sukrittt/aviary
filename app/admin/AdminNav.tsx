'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PulseIcon, ArrowLeftIcon, CreditCardIcon, CpuIcon, CurrencyInrIcon, SquaresFourIcon, LightbulbIcon, ChatCenteredTextIcon, ScrollIcon, SlidersIcon, UsersIcon, type PhosphorIcon } from '@/src/components/icons'
import { BirdMark } from '@/src/components/BirdMark'

const NAV: Array<{ href: string; label: string; icon: PhosphorIcon }> = [
  { href: '/admin', label: 'Overview', icon: SquaresFourIcon },
  { href: '/admin/users', label: 'Users', icon: UsersIcon },
  { href: '/admin/revenue', label: 'Revenue', icon: CurrencyInrIcon },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCardIcon },
  { href: '/admin/jobs', label: 'Jobs', icon: PulseIcon },
  { href: '/admin/feedback', label: 'Bug reports', icon: ChatCenteredTextIcon },
  { href: '/admin/ideas', label: 'Ideas', icon: LightbulbIcon },
  { href: '/admin/ai', label: 'AI usage', icon: CpuIcon },
  { href: '/admin/system', label: 'System', icon: SlidersIcon },
  { href: '/admin/changelog', label: 'Changelog', icon: ScrollIcon },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollIcon },
]

export function AdminNav() {
  const pathname = usePathname() ?? ''
  const isActive = (href: string) => (href === '/admin' ? pathname === href : pathname.startsWith(href))

  return (
    <nav className="erd-sidebar" aria-label="Admin">
      <div className="erd-brand">
        <Link href="/admin" className="erd-brand-link">
          <BirdMark size={34} />
          <span className="erd-side-label">Admin</span>
        </Link>
      </div>

      <div className="erd-nav-group">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`erd-nav-item ${isActive(href) ? 'is-active' : ''}`}
            aria-current={isActive(href) ? 'page' : undefined}
          >
            <Icon size={18} />
            <span className="erd-side-label">{label}</span>
          </Link>
        ))}
      </div>

      <div className="erd-nav-group erd-sidebar-foot">
        <Link href="/expense" className="erd-nav-item">
          <ArrowLeftIcon size={18} />
          <span className="erd-side-label">Back to app</span>
        </Link>
      </div>
    </nav>
  )
}
