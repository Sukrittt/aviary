import { pageMetadata } from '@/lib/seo'
export const metadata = pageMetadata('/legal/refunds')

const SUPPORT_EMAIL = 'aviary.playreview@gmail.com'

export default function RefundsPage() {
  return (
    <article className="legal-doc">
      <h1>Refund and cancellation policy</h1>
      <p className="legal-updated">Last updated 27 September 2026</p>

      <p>
        Aviary is a subscription with a 45-day free trial, so you can try everything before you pay anything.
        This page covers what happens when you cancel, and when you can get money back.
      </p>

      <h2>Cancelling</h2>
      <p>You can cancel any time. There&apos;s no fee and no notice period.</p>
      <ul>
        <li>
          <strong>Subscribed on the website:</strong> go to Account &rarr; Subscription &rarr; Cancel renewal.
          Revoking the UPI AutoPay mandate in your UPI app also cancels it.
        </li>
        <li>
          <strong>Subscribed in the Android app:</strong> cancel in the Google Play Store app under Profile
          &rarr; Payments &amp; subscriptions &rarr; Subscriptions.
        </li>
      </ul>
      <p>
        After you cancel, you won&apos;t be charged again, and you keep full access until the end of the period
        you&apos;ve already paid for. Your data stays yours: you can export it at any time, including after
        your subscription ends.
      </p>

      <h2>Refunds</h2>
      <p>
        Payments cover the period you&apos;ve started, so we don&apos;t refund part of a month or year after
        you cancel. We will refund you in full if:
      </p>
      <ul>
        <li>you were charged twice for the same period,</li>
        <li>you were charged after you&apos;d cancelled, or</li>
        <li>a renewal went through that you didn&apos;t intend, and you tell us within 7 days of it.</li>
      </ul>
      <p>
        Write to <strong>{SUPPORT_EMAIL}</strong> with the email on your Aviary account and the date of the
        charge. We reply within 3 working days. Approved refunds for website payments go back to the original
        UPI account or card, and usually arrive within 5 to 7 working days, depending on your bank.
      </p>
      <p>
        Refunds for Google Play purchases are handled by Google under{' '}
        <a href="https://support.google.com/googleplay/answer/2479637" target="_blank" rel="noreferrer">
          Google Play&apos;s refund policy
        </a>
        . You can still write to us and we&apos;ll help.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about a payment: <strong>{SUPPORT_EMAIL}</strong>. See our <a href="/legal/contact">contact
        page</a> for more.
      </p>
    </article>
  )
}
