'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, ArrowLeft, CreditCard, Cpu, LayoutDashboard, ScrollText, Settings2, Users, type LucideIcon } from 'lucide-react'
import { BirdMark } from '@/src/components/BirdMark'

const NAV: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/admin/jobs', label: 'Jobs', icon: Activity },
  { href: '/admin/ai', label: 'AI usage', icon: Cpu },
  { href: '/admin/system', label: 'System', icon: Settings2 },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
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
          <ArrowLeft size={18} />
          <span className="erd-side-label">Back to app</span>
        </Link>
      </div>
    </nav>
  )
}
