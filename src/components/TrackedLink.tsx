'use client'

import type { MouseEvent, ReactNode } from 'react'
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
}: {
  href: string
  event: AppEvent
  properties?: EventProperties
  className?: string
  children: ReactNode
}) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    track(event, properties)
    if (!isAnalyticsLoading() || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void Promise.race([analyticsReady(), new Promise((resolve) => setTimeout(resolve, MAX_WAIT_MS))])
      .then(() => window.location.assign(href))
  }

  return (
    <a className={className} href={href} onClick={onClick}>
      {children}
    </a>
  )
}
