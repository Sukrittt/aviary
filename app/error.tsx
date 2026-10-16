'use client'

import dynamic from 'next/dynamic'

// Dynamic, so the app stylesheets it brings load only when an error renders (see AppErrorScreen).
const AppErrorScreen = dynamic(() => import('@/src/components/AppErrorScreen').then((m) => m.AppErrorScreen))

/** Catches render errors in any route below the root layout. */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AppErrorScreen
      mood="snoozing"
      title="Something went wrong"
      description="This page tripped up. Give it another go."
      action={{ label: 'Try again', onClick: reset }}
    />
  )
}
