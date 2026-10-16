'use client'

import { AppErrorScreen } from '@/src/components/AppErrorScreen'

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
