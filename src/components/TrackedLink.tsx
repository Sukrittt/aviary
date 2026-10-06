'use client'

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { analyticsReady, isAnalyticsLoading, track, type AppEvent, type EventProperties } from '../lib/analytics'

/** Longest a click waits on analytics before navigating anyway. */
const MAX_WAIT_MS = 1000

/**
 * A plain `<a>` that counts the click. For links on server components (the
 * landing page, sign-in), where the one bit that needs an onClick has to be a
 * client component of its own.
 *
 * PostHog loads lazily, and a click that lands before it has would queue the
 * event and then leave the page, losing it. So a plain left-click made while
 * it's loading waits for it (briefly) before navigating. Modified clicks open
 * a new tab and leave this page alive, so they go straight through.
 */
export function TrackedLink({
  href,
  event,
  properties,
  className,
  children,
  disableOnClick = false,
}: {
  href: string
  event: AppEvent
  properties?: EventProperties
  className?: string
  children: ReactNode
  disableOnClick?: boolean
}) {
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)

  useEffect(() => {
    const reset = () => {
      pendingRef.current = false
      setPending(false)
    }
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (pendingRef.current) {
      e.preventDefault()
      return
    }
    const modified = e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
    if (disableOnClick && !modified) {
      pendingRef.current = true
      setPending(true)
    }
    track(event, properties)
    if (!isAnalyticsLoading() || modified) return
    e.preventDefault()
    void Promise.race([analyticsReady(), new Promise((resolve) => setTimeout(resolve, MAX_WAIT_MS))])
      .then(() => window.location.assign(href))
  }

  return (
    <a className={className} href={href} onClick={onClick} aria-disabled={pending || undefined} aria-busy={pending || undefined}>
      {children}
    </a>
  )
}
