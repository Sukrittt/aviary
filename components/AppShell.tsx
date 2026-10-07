'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useAppearance } from './AppearanceProvider'
import { CaptureTip } from './CaptureTip'
import { ChangelogAnnouncement } from './ChangelogAnnouncement'

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const { theme, density } = useAppearance()

  // Every route draws its own chrome (sidebar, headers, tabbar); this shell
  // only carries the theme/density classes and the expense nav flag.
  const isExpenseRoute = pathname.startsWith('/expense') || pathname === '/insights' || pathname.startsWith('/investments') || pathname.startsWith('/account') || pathname.startsWith('/admin')

  return (
    <main
      // Light is the default; resolved saved choices override it.
      className={`mc-page ${theme ? `theme-${theme}` : ''} density-${density} ${isExpenseRoute ? 'expense-shell' : ''}`}
    >
      <div className="mc-layout">
        <section className="mc-main">{children}</section>
      </div>
      <ChangelogAnnouncement />
      <CaptureTip />
    </main>
  )
}
