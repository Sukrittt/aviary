'use client'

import { useState } from 'react'
import { AppErrorScreen } from '@/src/components/AppErrorScreen'
import { reloadIfStaleBuild } from '@/src/lib/staleBuild'
import '@/src/theme/tokens.css'
import { fontVariables } from './fonts'

// Replaces the root layout when it crashes, so it brings its own <html>, fonts and tokens.

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading] = useState(() => reloadIfStaleBuild(error))
  return (
    <html lang="en" className={fontVariables}>
      <body style={{ margin: 0 }}>
        {!reloading && (
          <AppErrorScreen
            mood="snoozing"
            title="Something went wrong"
            description="Aviary tripped up. Give it another go."
            action={{ label: 'Try again', onClick: reset }}
          />
        )}
      </body>
    </html>
  )
}
