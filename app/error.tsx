'use client'

import { BirdEmptyState } from '@/src/components/BirdEmptyState'
import '@/src/expense-redesign.css'

/** Catches render errors in any route below the root layout. */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="expense-redesign">
      <BirdEmptyState
        mood="snoozing"
        title="Something went wrong"
        description="This page tripped up. Give it another go."
        action={{ label: 'Try again', onClick: reset }}
      />
    </main>
  )
}
