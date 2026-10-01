'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useBillingStatus } from '@/src/hooks/useBillingStatus'
import { RestrictedNotice } from '@/src/components/billing/RestrictedNotice'
import { TrialBanner } from '@/src/components/billing/TrialBanner'

/**
 * Routes that show the budgeting app itself. Only these are replaced when the
 * account has no valid access.
 *
 * An allowlist, not a blocklist, and that direction is the whole point: a
 * route added later is reachable by default rather than silently locked. The
 * server is what actually enforces this (lib/billing/guard.ts) — getting this
 * list wrong shows someone an empty screen, not someone else's data.
 *
 * Everything else stays open on purpose: the landing page, sign-in,
 * onboarding, /admin, and the /account pages an expired user has to keep:
 * data (export), security (sign out, delete), help and the tour.
 * The /account hub itself is gated: it's a menu into budgeting features, and
 * the lock screen lists those exit routes instead.
 */
const GATED_PREFIXES = [
  '/expense',
  '/insights',
  '/investments',
  '/wrapped',
  '/account/recurring',
  '/account/archive',
  '/account/bill-scans',
  '/account/chat-history',
]
const GATED_EXACT = ['/account']

function isGated(pathname: string): boolean {
  return GATED_EXACT.includes(pathname) || GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Renders the restricted screen instead of the app when access has lapsed.
 *
 * Deliberately renders children while the status is still loading or the
 * request failed. `useAccessAllowed` defaults to allowed for the same reason:
 * every one of these pages is backed by APIs that enforce this independently,
 * so a slow or failed status check costs a 402 on the data underneath —
 * whereas blocking on "unknown" would flash a paywall at paying users on
 * every cold load.
 */
export function SubscriptionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const gated = isGated(pathname)
  // Every gated route is also a middleware-protected app route, so asking
  // only here guarantees the request always carries a session.
  const { data } = useBillingStatus(gated)

  if (!gated) return <>{children}</>
  if (data && !data.allowed) return <RestrictedNotice />
  return (
    <>
      {/* Only above the budgeting screens. The countdown is a reminder to act
          before access stops, which is meaningless on the pages that stay
          reachable either way. */}
      <TrialBanner />
      {children}
    </>
  )
}
