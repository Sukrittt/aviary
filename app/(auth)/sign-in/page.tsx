import Link from 'next/link'
import { BirdMark } from '@/src/components/BirdMark'

export const metadata = { title: 'Sign in — Aviary' }

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ authError?: string }>
}) {
  const { authError } = await searchParams
  return (
    <div className="auth-card">
      <div className="auth-logo" aria-hidden="true">
        <BirdMark size={40} />
      </div>
      <h1 className="auth-headline">
        Less guessing.
        <br />
        More living.
      </h1>
      <p className="auth-subhead">
        Sign in with a one-time code or Google. No passwords to remember, ever.
      </p>
      {authError && (
        <p className="auth-error" role="alert">
          That sign-in link expired or was invalid. Please try again.
        </p>
      )}

      <div className="auth-actions">
        <a href="/api/auth/google" className="auth-btn auth-btn--outline">
          <span className="auth-google-mark" aria-hidden="true">
            G
          </span>
          Continue with Google
        </a>
        <Link href="/email" className="auth-btn auth-btn--primary">
          Continue with email
        </Link>
        <p className="auth-legal">
          By continuing you confirm you&apos;re 18 or older and agree to the <a href="/legal/terms">Terms</a> and{' '}
          <a href="/legal/privacy">Privacy Policy</a>.
        </p>
      </div>
    </div>
  )
}
