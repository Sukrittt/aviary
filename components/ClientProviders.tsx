'use client'

import type { ReactNode } from 'react'
import { AuthKitProvider } from '@workos-inc/authkit-nextjs/components'
import { OnboardingGate } from './OnboardingGate'
import { QueryProvider } from './QueryProvider'
import { AppShell } from './AppShell'
import { AppearanceProvider } from './AppearanceProvider'
import { CurrencyProvider } from './CurrencyProvider'
import { MoneyBrainProvider } from './MoneyBrainProvider'
import { MaintenanceBanner } from './MaintenanceBanner'
import { SubscriptionGate } from './SubscriptionGate'
import { AnalyticsProvider } from './AnalyticsProvider'
import { ScanBillProvider } from '@/src/features/scan-bill/ScanBillProvider'

// No AuthGate: signed-out visitors use the API's read-only demo account, while
// AuthKitProvider upgrades the same public pages when a real session exists.
export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthKitProvider>
      <AnalyticsProvider>
      <MaintenanceBanner />
      <QueryProvider>
        <ScanBillProvider>
          <CurrencyProvider><AppearanceProvider>
            <MoneyBrainProvider>
              <OnboardingGate>
                {/* Inside AppShell, not around it: an expired user keeps the
                    nav, so they can still reach export and account settings. */}
                <AppShell>
                  <SubscriptionGate>{children}</SubscriptionGate>
                </AppShell>
              </OnboardingGate>
            </MoneyBrainProvider>
          </AppearanceProvider></CurrencyProvider>
        </ScanBillProvider>
      </QueryProvider>
      </AnalyticsProvider>
    </AuthKitProvider>
  )
}
