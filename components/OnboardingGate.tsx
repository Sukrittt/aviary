'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LoadingCaption } from '@/src/components/LoadingCaption'
import '@/src/expense-redesign.css'

// Pages that exist outside the "logged in and onboarded" app proper — never
// bounce these to /onboarding even if the onboarding check would otherwise fire.
// '/' is public; middleware sends signed-in visitors straight to /expense.
// /legal is public too: gating it held every legal page behind a loader until a
// /api/user call that a signed-out visitor can only fail.
const ONBOARDING_EXEMPT_PATHS = ['/', '/sign-in', '/email', '/code', '/onboarding', '/legal']

function isExempt(pathname: string): boolean {
  return ONBOARDING_EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Single app-mount onboarding gate: once, not per page. Skipped on the
 * auth/onboarding pages themselves so it can't loop.
 *
 * Holds the app behind a loader until the check answers. Rendering children
 * meanwhile let a brand-new user see the "plan required" screen (they have no
 * trial until onboarding) before being bounced to /onboarding.
 *
 * This used to live inside DashboardProvider, which otherwise only served the
 * deleted Mission Control views.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const [checking, setChecking] = useState(() => !isExempt(pathname))

  useEffect(() => {
    if (isExempt(pathname)) return

    void (async () => {
      try {
        const res = await fetch('/api/user')
        if (res.ok) {
          const user = await res.json()
          // Stay on the loader until the route lands on /onboarding, which is exempt.
          if (!user.onboardedAt) return router.replace('/onboarding')
        }
      } catch {
        // Network hiccup — not worth blocking the app over, next mount tries again.
      }
      setChecking(false)
    })()
    // Intentionally runs once per mount, not per pathname change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Once the redirect lands, the check is done; finishing onboarding must not
  // return to a loader that is still waiting on it.
  useEffect(() => {
    if (isExempt(pathname)) setChecking(false)
  }, [pathname])

  if (checking && !isExempt(pathname)) {
    // .expense-redesign carries the app font and colors; erd-home-loading centers.
    return (
      <section className="expense-redesign">
        <div className="erd-home-loading">
          <LoadingCaption feature="appEntry" placement="page" />
        </div>
      </section>
    )
  }
  return <>{children}</>
}
