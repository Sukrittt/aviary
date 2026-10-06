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

// Set once /api/user confirms onboarding, so a returning visit renders the app
// without waiting on that round trip first. It isn't keyed by account, so the
// sign-in pages clear it: every account switch passes through one of them, and
// the next account starts from a full check.
const ONBOARDED_KEY = 'aviary.onboarded'
const SIGN_IN_PATHS = ['/sign-in', '/email', '/code']

function readOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return false
  }
}

function writeOnboarded(onboarded: boolean): void {
  try {
    if (onboarded) localStorage.setItem(ONBOARDED_KEY, '1')
    else localStorage.removeItem(ONBOARDED_KEY)
  } catch {
    // Storage blocked: every visit just waits on the check, as before.
  }
}

// Server-rendered routes that make the onboarding check themselves before
// rendering (see app/expense/page.tsx). Exact paths, not prefixes: the routes
// under them are still client pages that rely on this gate.
const SERVER_CHECKED_PATHS = ['/expense']

function isExempt(pathname: string): boolean {
  if (SERVER_CHECKED_PATHS.includes(pathname)) return true
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
    // A browser that has already seen this account onboarded skips the wait:
    // onboardedAt never goes back to null, so the check below only confirms it.
    if (readOnboarded()) setChecking(false)

    void (async () => {
      try {
        const res = await fetch('/api/user')
        if (res.ok) {
          const user = await res.json()
          // Stay on the loader until the route lands on /onboarding, which is exempt.
          if (!user.onboardedAt) {
            writeOnboarded(false)
            return router.replace('/onboarding')
          }
          writeOnboarded(true)
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
    if (SIGN_IN_PATHS.includes(pathname)) writeOnboarded(false)
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
