'use client'

import type { ComponentProps } from 'react'
import '@/src/appStyles'
import { BirdEmptyState } from './BirdEmptyState'

/**
 * The root 404 and error screens. Load it with next/dynamic: anything app/not-found.tsx
 * or app/error.tsx imports directly ships its CSS on every page, and the app
 * stylesheets this needs are most of what a public page would otherwise download.
 */
export function AppErrorScreen(props: ComponentProps<typeof BirdEmptyState>) {
  return (
    <main className="expense-redesign">
      <BirdEmptyState {...props} />
    </main>
  )
}
