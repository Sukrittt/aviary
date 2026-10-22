import '@/src/appStyles'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { pageMetadata } from '@/lib/seo'
import { callGet } from '@/lib/serverQuery'
import type { UserProfile } from '@/src/api/account'
import { CurrencyScope } from '@/src/context/CurrencyContext'
import { currencyForCountry } from '@/src/lib/countryCurrency'
import { GET as userGET } from '../api/user/route'

export const metadata = pageMetadata('/onboarding')

// The income step's currency chip starts on the visitor's local currency, by
// Vercel's geo header. No header (local dev, unknown IP) keeps the INR default.
export default async function Layout({ children }: { children: ReactNode }) {
  // An account that already finished setup goes home. The wizard keeps its
  // step in state, so reloading on the screens after setup restarted it at
  // income. This runs per page load only, never between the wizard's own
  // steps, so those post-setup screens still show. An unreadable profile
  // renders the wizard, as before.
  const [user, h] = await Promise.all([
    callGet<UserProfile>(userGET, '/api/user').catch(() => null),
    headers(),
  ])
  if (user?.onboardedAt) redirect('/expense')
  return <CurrencyScope code={currencyForCountry(h.get('x-vercel-ip-country'))}>{children}</CurrencyScope>
}
