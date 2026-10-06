import type { ReactNode } from 'react'
import Link from 'next/link'
import { BirdMark } from '@/src/components/BirdMark'
import '@/src/expense-redesign.css'

/** Public, unauthenticated shell for /legal/* — reachable with no session (see middleware.ts). */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="expense-redesign legal-page">
      <div className="legal-shell">
        <Link href="/" className="legal-back" aria-label="Aviary home">
          <BirdMark size={30} perched />
          <span>Aviary<b aria-hidden="true">.</b></span>
        </Link>
        {children}
        <nav className="legal-footer-nav" aria-label="Legal pages">
          <Link href="/legal/privacy">Privacy Policy</Link>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/pricing">Pricing</Link>
          <Link href="/legal/refunds">Refunds</Link>
          <Link href="/legal/contact">Contact</Link>
          <Link href="/legal/delete-account">Delete your account</Link>
        </nav>
      </div>
    </div>
  )
}
