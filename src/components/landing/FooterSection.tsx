'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { MARKET_COOKIE, rupeeOnly } from '@/lib/market'

const noSubscribe = () => () => {}
const intlCookie = () => document.cookie.split('; ').includes(`${MARKET_COOKIE}=intl`)

/**
 * One footer column of content pages. Outside India (the /intl page, or
 * middleware's market cookie on static pages) the rupee-only tools drop out.
 * The server render is India's, so an intl visitor's list settles on hydration.
 */
export function FooterSection({ path, label, pages, intl = false }: { path: string; label: string; pages: readonly (readonly [string, string])[]; intl?: boolean }) {
  const fromCookie = useSyncExternalStore(noSubscribe, intlCookie, () => false)
  const shown = intl || fromCookie ? pages.filter(([href]) => !rupeeOnly(href)) : pages
  return <div><h2><Link href={path}>{label}</Link></h2>{shown.map(([href, text]) => <Link key={href} href={href}>{text}</Link>)}</div>
}
