'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import { BirdEmptyState } from './BirdEmptyState'

// The app stylesheets as a chunk of their own: anything app/not-found.tsx, error.tsx or
// global-error.tsx imports directly ships its CSS with every page, and these sheets are
// most of what a public page would otherwise download. Server-rendered, they're linked
// in the HTML. On the client the screen shows at once and picks them up when the chunk
// lands, and still shows if it can't (a deploy mid-session is a common way to get here).
const AppSheets = dynamic(() => import('./AppSheets').catch(() => ({ default: () => null })))

/** The root 404 and error screens. */
export function AppErrorScreen(props: ComponentProps<typeof BirdEmptyState>) {
  return (
    <main className="expense-redesign">
      <AppSheets />
      <BirdEmptyState {...props} />
    </main>
  )
}
