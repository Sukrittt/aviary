'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { identifyUser, initAnalytics, resetAnalytics, SIGN_IN_OUTCOME_COOKIE, track } from '@/src/lib/analytics'

/**
 * Starts PostHog and keeps its identity in step with the WorkOS session.
 * Web's counterpart to mobile's initAnalytics() in app/_layout.tsx.
 *
 * Signed-out visitors stay anonymous. They're either on the landing page or
 * browsing the shared read-only demo account, and neither is a person.
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const identifiedAs = useRef<string | null>(null)

  useEffect(() => {
    initAnalytics()
    // Report a Google sign-in the server just finished. Taken once and cleared,
    // so a reload doesn't count it twice. A completed sign-in can land here
    // before identify; PostHog merges this anonymous event into the person.
    const outcome = document.cookie.match(new RegExp(`(?:^|; )${SIGN_IN_OUTCOME_COOKIE}=([^;]*)`))?.[1]
    if (!outcome) return
    document.cookie = `${SIGN_IN_OUTCOME_COOKIE}=; path=/; max-age=0`
    if (outcome === 'completed') track('sign_in_completed', { method: 'google' })
    else track('sign_in_failed', { method: 'google', reason: outcome })
  }, [])

  const userId = user?.id ?? null
  const email = user?.email ?? null
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null

  useEffect(() => {
    if (userId && identifiedAs.current !== userId) {
      identifyUser({ id: userId, email, name })
      identifiedAs.current = userId
    } else if (!userId && identifiedAs.current) {
      // Signed out: drop the person so the next account here starts clean.
      resetAnalytics()
      identifiedAs.current = null
    }
  }, [userId, email, name])

  return <>{children}</>
}
