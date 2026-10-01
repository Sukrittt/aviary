'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'

/**
 * Mirrors Mobile/app/_layout.tsx's client config (`retry: 1`); per-query
 * staleTimes live on the hooks themselves in src/hooks/, same as there.
 *
 * The client is created in state rather than at module scope: a module-level
 * client is shared across requests on the server, which would leak one user's
 * cached rows into another's render. Mobile has one process per user and can
 * hold a module-level client; the web can't.
 *
 * Mobile clears the cache by hand when the signed-in identity changes, because
 * query keys carry no user id. Here sign-in and sign-out are full navigations
 * (`app/logout/route.ts`, the auth routes' redirects), so the whole client is
 * discarded with the document and there is nothing to clear.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }))
  return (
    <QueryClientProvider client={client}>
      {/* App-wide: honour the OS reduce-motion setting in every motion component. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </QueryClientProvider>
  )
}
