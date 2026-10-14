'use client'

import { BirdEmptyState } from '@/src/components/BirdEmptyState'
import '@/src/theme/tokens.css'
import '@/src/expense-redesign.css'
import { fontVariables } from './fonts'

// Replaces the root layout when it crashes, so it brings its own <html>, fonts and tokens.

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className={fontVariables}>
      <body style={{ margin: 0 }}>
        <main className="expense-redesign">
          <BirdEmptyState
            mood="snoozing"
            title="Something went wrong"
            description="Aviary tripped up. Give it another go."
            action={{ label: 'Try again', onClick: reset }}
          />
        </main>
      </body>
    </html>
  )
}
