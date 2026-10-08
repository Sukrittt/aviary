'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PAGES = [
  ['/legal/privacy', 'Privacy'],
  ['/legal/terms', 'Terms'],
  ['/legal/pricing', 'Pricing'],
  ['/legal/refunds', 'Refunds'],
  ['/legal/delete-account', 'Delete account'],
  ['/legal/contact', 'Contact'],
] as const

/** Pills across the legal pages, the current one filled. */
export function LegalNav() {
  const path = usePathname()
  return <nav className="lp-doc-nav" aria-label="Legal pages">
    {PAGES.map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>{label}</Link>)}
  </nav>
}
