'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'

// Pages that exist outside the "logged in and onboarded" app proper — never
// bounce these to /onboarding even if the onboarding check would otherwise fire.
// '/' is public; middleware sends signed-in visitors straight to /expense.
const ONBOARDING_EXEMPT_PATHS = ['/', '/sign-in', '/email', '/code', '/onboarding']

/**
 * Single app-mount onboarding gate: once, not per page. Skipped on the
 * auth/onboarding pages themselves so it can't loop.
 *
 * This used to live inside DashboardProvider, which otherwise only served the
 * deleted Mission Control views.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const router = useRouter()

  useEffect(() => {
    if (ONBOARDING_EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return

    void (async () => {
      try {
        const res = await fetch('/api/user')
        if (!res.ok) return
        const user = await res.json()
        if (!user.onboardedAt) router.push('/onboarding')
      } catch {
        // Network hiccup — not worth blocking the app over, next mount tries again.
      }
    })()
    // Intentionally runs once per mount, not per pathname change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}
