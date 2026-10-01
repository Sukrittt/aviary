import type { ReactNode } from 'react'
import Link from 'next/link'
import { BirdMark } from '@/src/components/BirdMark'
import '../../src/expense-redesign.css'

/**
 * Shared chrome for /sign-in, /email, /code. Under 1024px: a centered card over
 * soft drifting blobs. Desktop: a split screen, brand panel left, form right.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="expense-redesign auth-page">
      <div className="auth-backdrop" aria-hidden="true">
        <div className="auth-blob auth-blob--gold" />
        <div className="auth-blob auth-blob--mint" />
        <div className="auth-blob auth-blob--gold-2" />
        <div className="auth-blob auth-blob--mint-2" />
      </div>
      <aside className="auth-brand">
        <Link href="/" className="auth-brand-mark" aria-label="Aviary home">
          <BirdMark size={34} /> Aviary
        </Link>
        <div className="auth-brand-body">
          <p className="auth-brand-headline">
            Envelope budgeting that{' '}
            <span className="auth-brand-learns">
              learns
              <svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
                <path d="M3 10 C 40 3, 70 3, 100 8 S 160 13, 197 5" />
              </svg>
            </span>{' '}
            your spending.
          </p>
        </div>
      </aside>
      <div className="auth-main">{children}</div>
    </div>
  )
}
