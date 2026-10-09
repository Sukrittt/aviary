'use client'

import { Fredoka, Nunito } from 'next/font/google'
import { BirdEmptyState } from '@/src/components/BirdEmptyState'
import '@/src/theme/tokens.css'
import '@/src/expense-redesign.css'

// Replaces the root layout when it crashes, so it brings its own <html>, fonts and tokens.
const fredoka = Fredoka({ subsets: ['latin'], variable: '--font-fredoka', display: 'swap' })
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito', display: 'swap' })

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className={`${fredoka.variable} ${nunito.variable}`} style={{ margin: 0 }}>
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
