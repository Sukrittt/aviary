import { pageMetadata } from '@/lib/seo'
export const metadata = pageMetadata('/legal/contact')

const SUPPORT_EMAIL = 'aviary.playreview@gmail.com'

export default function ContactPage() {
  return (
    <article className="legal-doc">
      <h1>Contact us</h1>
      <p className="legal-updated">Last updated 27 September 2026</p>

      <p>
        Aviary is built and run by an independent developer in India. For anything about your account, a
        payment, a refund, or your data, email us and we&apos;ll get back to you within 3 working days.
      </p>

      <h2>Email</h2>
      <p>
        <a href={`mailto:${SUPPORT_EMAIL}`}>
          <strong>{SUPPORT_EMAIL}</strong>
        </a>
      </p>
      <p>Include the email you sign in to Aviary with, so we can find your account.</p>

      <h2>Signed in already?</h2>
      <p>
        You can also send feedback from inside the app: Account &rarr; Help &amp; feedback.
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <a href="/legal/refunds">Refund and cancellation policy</a>
        </li>
        <li>
          <a href="/legal/pricing">Pricing</a>
        </li>
        <li>
          <a href="/legal/delete-account">Delete your account</a>
        </li>
      </ul>
    </article>
  )
}
