'use client'

import dynamic from 'next/dynamic'
import '@/src/theme/tokens.css'
import { fontVariables } from './fonts'

// Dynamic: Next ships global-error's own CSS with every page, and the app stylesheets
// the screen needs would otherwise land on public pages too (see AppErrorScreen).
const AppErrorScreen = dynamic(() => import('@/src/components/AppErrorScreen').then((m) => m.AppErrorScreen))

// Replaces the root layout when it crashes, so it brings its own <html>, fonts and tokens.

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className={fontVariables}>
      <body style={{ margin: 0 }}>
        <AppErrorScreen
          mood="snoozing"
          title="Something went wrong"
          description="Aviary tripped up. Give it another go."
          action={{ label: 'Try again', onClick: reset }}
        />
      </body>
    </html>
  )
}
