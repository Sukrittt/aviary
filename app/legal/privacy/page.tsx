import { pageMetadata } from '@/lib/seo'

const SUPPORT_EMAIL = 'support@useaviary.com'

export default function PrivacyPage() {
  return (
    <article className="legal-doc">
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated 4 September 2026</p>

      <p>
        Aviary (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is an independently developed, personal budgeting app.
        This policy explains what we collect, why, and how you can control or remove it. It applies to the
        Aviary Android and iOS apps and to this website.
      </p>

      <h2>Who this is</h2>
      <p>
        Aviary is developed and operated by an individual developer based in India. For any privacy question
        or request, write to <strong>{SUPPORT_EMAIL}</strong>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account information.</strong> Email address, display name, profile picture URL, and a device
          description (e.g. &ldquo;Pixel 8 &middot; Android 15&rdquo;), collected when you sign in with Google
          or an emailed one-time code. Authentication is handled by our identity provider, WorkOS.
        </li>
        <li>
          <strong>The financial data you enter.</strong> Envelopes, budgets, transactions, item names, notes,
          subscriptions, and investment holdings you add. Amounts, item names, notes, and AI chat text are
          encrypted at rest with AES-256-GCM before they reach our database. Dates, category names, payment
          methods, subscription and holding names are stored as plain text so search and filtering work; we
          don&apos;t encrypt those.
        </li>
        <li>
          <strong>Receipt photos, for bill scanning only.</strong> If you use the scan-a-bill feature, the photo
          is sent to Google&apos;s Gemini model to read the amount and merchant off it, and is not stored by us
          afterward.
        </li>
        <li>
          <strong>Money Brain / AI chat.</strong> If you ask our AI assistant a question, we send it your recent
          transactions, envelope balances, and subscription and investment summaries so it can answer
          accurately, along with the text you type. Conversations are stored in our database so you can revisit
          them, and you can delete them at any time.
        </li>
        <li>
          <strong>Product analytics.</strong> The mobile app and the web app send your email and name, the
          screens and pages you open, and product events (e.g. signing in, each step of setup, logging an
          expense, moving money, scanning a bill, viewing plans) to PostHog, an analytics provider based in the
          United States. No amounts, item text or envelope names are included in these events, and we don&apos;t
          record your screen. On the website, visitors who aren&apos;t signed in are counted anonymously.
          Analytics is on by default. You can turn it off at any time in Settings &rarr; Your data &rarr;
          Share usage analytics, on either app; turning it off stops new data from being sent from that device
          or browser.
        </li>
        <li>
          <strong>Push notifications.</strong> A push token identifying your device, used to send budget alerts,
          bill reminders, and digests. Notification text can include category names and amounts (e.g.
          &ldquo;You&apos;ve overspent &#8377;500 in Food&rdquo;), delivered through Google&apos;s and
          Apple&apos;s push services.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To run the budgeting features you use, to answer questions you ask our AI assistant, to send the
        notifications you&apos;ve enabled, to fix bugs, and to understand which features are actually used so we
        can improve them. We don&apos;t sell your data, and we don&apos;t use it for advertising.
      </p>

      <h2>Who we share it with</h2>
      <p>Data only goes to the services that make the app work:</p>
      <ul>
        <li><strong>WorkOS</strong> — sign-in and account identity.</li>
        <li><strong>MongoDB Atlas</strong> — where your data is stored, with the encryption described above.</li>
        <li><strong>UserJot</strong> — the external feedback board, when you choose to open it and submit feedback.</li>
        <li>
          <strong>Google Gemini</strong> — receives transaction and budget context for Money Brain and AI
          briefs, and receipt photos for bill scanning. Google does not use this data to train its models under
          our API agreement with them.
        </li>
        <li><strong>PostHog</strong> — product analytics, U.S.-hosted, toggleable off as described above.</li>
        <li><strong>Expo / Google Firebase</strong> — delivers push notifications.</li>
        <li><strong>Vercel</strong> — hosts the app and its API, and stores data exports you request.</li>
      </ul>
      <p>
        Some of these providers are located outside India, including in the United States, so using Aviary
        means your data may be processed there.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Deleting an envelope, transaction, or your whole account moves it into a recoverable, inaccessible state
        for 7 days &mdash; enough time to undo an accidental deletion by signing back in &mdash; after which it
        is permanently deleted from our active systems, including your account with our identity provider.
      </p>

      <h2>Your rights</h2>
      <p>
        You can access, correct, export, or delete your data at any time from Settings &rarr; Your data, or the
        account page on the web. You can withdraw consent for analytics at any time (see above). Under
        India&apos;s Digital Personal Data Protection Act, you have the right to access, correct, and erase your
        personal data, to nominate someone to exercise these rights on your behalf, and to file a grievance with
        us at {SUPPORT_EMAIL} &mdash; we&apos;ll respond within 30 days. If you&apos;re in the EU/UK or
        California, you have equivalent rights under GDPR or the CCPA, including the right to data portability;
        we don&apos;t sell personal information, so there&apos;s nothing to opt out of there.
      </p>

      <h2>Security</h2>
      <p>
        Financial values, item names, notes, and AI chat text are encrypted at rest with AES-256-GCM before
        they&apos;re written to our database, so a leaked backup or exposed connection string only turns up
        ciphertext. This isn&apos;t end-to-end encryption &mdash; our server decrypts your data to run your
        budget and answer AI questions &mdash; so it protects you if the database leaks, not if our server
        itself is compromised. All traffic between the app and our servers is encrypted in transit (HTTPS).
      </p>

      <h2>Children</h2>
      <p>
        Aviary isn&apos;t directed at children, and we don&apos;t knowingly collect data from anyone under 18.
        If you believe a child has provided us data, contact us and we&apos;ll delete it.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If this policy changes materially, we&apos;ll update the date at the top and, for significant changes,
        note it in the app.
      </p>

      <h2>Contact</h2>
      <p>
        Questions, requests, or complaints about your data: <strong>{SUPPORT_EMAIL}</strong>.
      </p>
    </article>
  )
}

export const metadata = pageMetadata('/legal/privacy')
