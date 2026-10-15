import type { ReactNode } from 'react'
import { LandingMotion } from '@/src/components/landing/LandingClient'
import { LandingFooter, LandingHeader } from '@/src/components/landing/Chrome'
import '@/src/landing.css'

/** Public content pages (changelog, help): the landing's header and footer around one readable column. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <LandingMotion><div className="lp" id="top">
    <LandingHeader base="/" />
    <main className="lp-doc">{children}</main>
    <LandingFooter base="/" />
  </div></LandingMotion>
}
