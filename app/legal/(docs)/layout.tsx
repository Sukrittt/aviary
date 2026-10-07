import type { ReactNode } from 'react'
import { LandingMotion } from '@/src/components/landing/LandingClient'
import { LandingFooter, LandingHeader } from '@/src/components/landing/Chrome'
import { LegalNav } from './LegalNav'
import '@/src/landing.css'

/** Public, unauthenticated shell for the legal documents — reachable with no session (see middleware.ts). */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return <LandingMotion><div className="lp" id="top">
    <LandingHeader base="/" />
    <main className="lp-doc">
      <LegalNav />
      {children}
    </main>
    <LandingFooter base="/" />
  </div></LandingMotion>
}
