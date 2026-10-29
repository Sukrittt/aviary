'use client'

import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { AppErrorScreen } from '@/src/components/AppErrorScreen'
import { reloadIfStaleBuild } from '@/src/lib/staleBuild'

/** Catches render errors in any route below the root layout. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // A deploy under an open tab: reload into the new build instead of showing the error.
  const pathname = usePathname()
  const [reloading] = useState(() => reloadIfStaleBuild(error, pathname))
  if (reloading) return null
  return (
    <AppErrorScreen
      mood="snoozing"
      title="Something went wrong"
      description="This page tripped up. Give it another go."
      action={{ label: 'Try again', onClick: reset }}
    />
  )
}
