'use client'

import type { ReactNode } from 'react'
import { track, type AppEvent, type EventProperties } from '../lib/analytics'

/**
 * A plain `<a>` that counts the click. For links on server components (the
 * landing page, sign-in), where the one bit that needs an onClick has to be a
 * client component of its own.
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
  return (
    <a className={className} href={href} onClick={() => track(event, properties)}>
      {children}
    </a>
  )
}
