'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { LoadingCaption } from '@/src/components/LoadingCaption'

// The loader stands in for the route, so the route's layout (which links the app
// stylesheets) never renders: it pulls them itself, as AppErrorScreen does.
const AppSheets = dynamic(() => import('@/src/components/AppSheets').catch(() => ({ default: () => null })))

// The "logged in and onboarded" app proper: the only pages held for the check.
// Everything else skips it: public pages (landing, content, legal) must
// server-render their body for crawlers, sign-in and /onboarding can't loop, and
// a 404 renders straight away (its loader would have no app styles to wear).
const GATED_PATHS = ['/expense', '/insights', '/investments', '/wrapped', '/account', '/admin']

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

// False while server-rendering and hydrating, true after: storage can only be
// read during render once the server HTML (which never knows it) is matched.
const noop = () => () => {}
function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false)
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

/** The signed-in, onboarded app's pages: not public pages, sign-in or /onboarding. */
export function isAppPage(pathname: string): boolean {
  return GATED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function isExempt(pathname: string): boolean {
  if (SERVER_CHECKED_PATHS.includes(pathname)) return true
  return !isAppPage(pathname)
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
export function OnboardingGate({ children, recheck = false }: {
  children: ReactNode
  /**
   * Check even on a route that normally does it on the server. For when that
   * server check couldn't read the profile (app/expense/page.tsx), so a
   * not-onboarded account still ends up on /onboarding.
   */
  recheck?: boolean
}) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const exempt = !recheck && isExempt(pathname)
  // Whether the check has answered (or was skipped by the stored flag). It runs
  // once, on the first app page: the visit may well start on a public one.
  const [checked, setChecked] = useState(false)
  const started = useRef(false)
  // A client-side visit to the first app page doesn't wait a frame on the effect
  // below: that frame drew the loader, unstyled when coming from a public page.
  const knownOnboarded = useHydrated() && readOnboarded()

  useEffect(() => {
    if (exempt || started.current) return
    started.current = true
    // A browser that has already seen this account onboarded skips the wait:
    // onboardedAt never goes back to null, so the check below only confirms it.
    if (readOnboarded()) setChecked(true)

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
      setChecked(true)
    })()
    // router is stable; the started ref keeps this to one check per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exempt])

  // Once the redirect lands, the check is done; finishing onboarding must not
  // return to a loader that is still waiting on it.
  useEffect(() => {
    if (SIGN_IN_PATHS.includes(pathname)) writeOnboarded(false)
    if (exempt && started.current) setChecked(true)
  }, [pathname, exempt])

  if (!checked && !exempt && !knownOnboarded) {
    // .expense-redesign carries the app font and colors; erd-home-loading centers.
    return (
      <section className="expense-redesign">
        <AppSheets />
        <div className="erd-home-loading">
          <LoadingCaption feature="appEntry" placement="page" />
        </div>
      </section>
    )
  }
  return <>{children}</>
}
