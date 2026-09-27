export const metadata = { title: 'Terms — Aviary' }

const SUPPORT_EMAIL = 'aviary.playreview@gmail.com'

export default function TermsPage() {
  return (
    <article className="legal-doc">
      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated 27 September 2026</p>

      <p>
        These terms cover your use of Aviary, a personal budgeting app. By creating an account or using the
        app, you agree to them. If you don&apos;t agree, please don&apos;t use Aviary.
      </p>

      <h2>The service</h2>
      <p>
        Aviary helps you track envelopes, expenses, subscriptions, and investments for personal, non-commercial
        use. It&apos;s developed and operated by an individual, not a company, and offered as-is.
      </p>

      <h2>Eligibility</h2>
      <p>
        You must be 18 or older to use Aviary. By creating an account or using the app, you confirm that you
        are. If we learn that someone under 18 has an account, we may close it.
      </p>

      <h2>Your account</h2>
      <p>
        You need an account to use Aviary. You&apos;re responsible for keeping the device and email you sign
        in with secure. Tell us at {SUPPORT_EMAIL} if you believe your account has been accessed without your
        permission.
      </p>

      <h2>Subscriptions and billing</h2>
      <p>
        New accounts get a 45-day free trial that starts when you finish onboarding. No payment details are
        needed for the trial and it never charges you automatically. To keep using Aviary afterwards, you can
        buy a monthly or yearly subscription in either of two places. Current prices are on our{' '}
        <a href="/legal/pricing">pricing page</a> and are shown again before you pay.
      </p>
      <ul>
        <li>
          <strong>On the website</strong>, paid through Razorpay with UPI or a card.
        </li>
        <li>
          <strong>In the Android app</strong>, paid through Google Play.
        </li>
      </ul>
      <p>Either one unlocks Aviary everywhere you sign in with the same account.</p>
      <ul>
        <li>
          <strong>Renewal.</strong> Subscriptions renew automatically at the end of each monthly or yearly
          period until you cancel, charged the same way you first paid.
        </li>
        <li>
          <strong>Cancelling.</strong> A website subscription is cancelled on your account page:{' '}
          Account &rarr; Subscription &rarr; Cancel renewal. A Google Play subscription is cancelled in the
          Google Play Store app: Profile &rarr; Payments &amp; subscriptions &rarr; Subscriptions &rarr; Aviary
          &rarr; Cancel. Either way, you keep access until the end of the period you&apos;ve paid for. Deleting
          your Aviary account cancels a website subscription for you, but not a Google Play one.
        </li>
        <li>
          <strong>Refunds.</strong> See our <a href="/legal/refunds">refund and cancellation policy</a>. Google
          Play purchases also follow Google Play&apos;s refund policy.
        </li>
        <li>
          <strong>If a subscription ends.</strong> Your data is kept for 12 months and you can export it at any
          time, including after your subscription ends.
        </li>
        <li>
          <strong>Price changes.</strong> If the price changes, we&apos;ll tell you before your next renewal, and
          you can cancel before it applies.
        </li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Don&apos;t use Aviary to:</p>
      <ul>
        <li>resell or offer it as part of another commercial product,</li>
        <li>reverse engineer, scrape, or attempt to disrupt the service,</li>
        <li>upload unlawful content, or</li>
        <li>attempt to access another user&apos;s data.</li>
      </ul>

      <h2>AI features</h2>
      <p>
        Money Brain, bill scanning, and AI-written notifications use a third-party AI model and are best-effort.
        They can be wrong, so double-check anything that matters before you act on it. Nothing Aviary generates
        is financial, tax, legal, or investment advice.
      </p>

      <h2>Third-party services</h2>
      <p>
        Aviary depends on services we don&apos;t control (sign-in, hosting, the AI model, push notifications).
        We aren&apos;t responsible for their outages or changes, though we&apos;ll do our best to keep the app
        working around them.
      </p>

      <h2>Your data</h2>
      <p>
        You own the data you enter. You can export or delete it at any time &mdash; see our{' '}
        <a href="/legal/privacy">Privacy Policy</a> for how, and our{' '}
        <a href="/legal/delete-account">account deletion page</a> for the deletion flow specifically.
      </p>

      <h2>Termination</h2>
      <p>
        You can delete your account whenever you like. We may suspend or terminate an account that violates
        these terms.
      </p>

      <h2>No warranty</h2>
      <p>
        Aviary is provided &ldquo;as is&rdquo;, without warranty of any kind, including accuracy, availability,
        or fitness for a particular purpose.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent permitted by law, we aren&apos;t liable for indirect, incidental, or consequential damages
        arising from your use of Aviary, including decisions made based on its budgeting figures or AI output.
      </p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India, and any dispute will be subject to the jurisdiction of Indian courts.</p>

      <h2>Changes</h2>
      <p>We may update these terms from time to time; the date above reflects the latest revision.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <strong>{SUPPORT_EMAIL}</strong>.
      </p>
    </article>
  )
}
