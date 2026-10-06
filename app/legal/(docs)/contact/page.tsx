import Link from 'next/link'
import { Github, Mail, MessageSquareHeart, Smartphone } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'
import { FEEDBACK_BOARD_URL } from '@/lib/links'
import { GITHUB } from '@/src/components/landing/Chrome'

export const metadata = pageMetadata('/legal/contact')

const SUPPORT_EMAIL = 'support@useaviary.com'

export default function ContactPage() {
  return (
    <article className="lp-contact">
      <h1 className="lp-h2">Say hello.</h1>
      <p className="lp-lede">
        Aviary is built and run by one person in India. For anything about your account, a payment, a refund
        or your data, write in. You&apos;ll hear back within 3 working days.
      </p>

      <a className="lp-contact-mail" href={`mailto:${SUPPORT_EMAIL}`}>
        <span className="lp-include-icon lp-tone-fun" aria-hidden="true"><Mail size={22} strokeWidth={2.2} /></span>
        <span className="lp-contact-mail-copy">
          <strong>{SUPPORT_EMAIL}</strong>
          <span>Include the email you sign in with, so your account is easy to find.</span>
        </span>
      </a>

      <div className="lp-contact-ways">
        <div className="lp-card lp-pay-card">
          <span className="lp-include-icon lp-tone-food" aria-hidden="true"><Smartphone size={22} strokeWidth={2.2} /></span>
          <strong>Signed in already?</strong>
          <span>Send feedback from inside the app: Account, then Help &amp; feedback.</span>
        </div>
        <a className="lp-card lp-pay-card" href={FEEDBACK_BOARD_URL} target="_blank" rel="noreferrer">
          <span className="lp-include-icon lp-tone-savings" aria-hidden="true"><MessageSquareHeart size={22} strokeWidth={2.2} /></span>
          <strong>Feedback board</strong>
          <span>Suggest a feature or vote on what gets built next.</span>
        </a>
        <a className="lp-card lp-pay-card" href={GITHUB} target="_blank" rel="noreferrer">
          <span className="lp-include-icon lp-tone-rent" aria-hidden="true"><Github size={22} strokeWidth={2.2} /></span>
          <strong>GitHub</strong>
          <span>Aviary is open source. Read the code or open an issue.</span>
        </a>
      </div>

      <p className="lp-body lp-contact-related">
        Looking for something specific? See the <Link href="/legal/refunds">refund and cancellation policy</Link>,{' '}
        <Link href="/legal/pricing">pricing</Link>, or how to <Link href="/legal/delete-account">delete your account</Link>.
      </p>
    </article>
  )
}
