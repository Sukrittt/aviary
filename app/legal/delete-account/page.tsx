export const metadata = { title: 'Delete your account — Aviary' }

const SUPPORT_EMAIL = 'support@useaviary.com'

export default function DeleteAccountPage() {
  return (
    <article className="legal-doc">
      <h1>Delete your account</h1>
      <p className="legal-updated">Last updated 4 September 2026</p>

      <p>You can delete your Aviary account and data yourself, right from the app.</p>

      <h2>In the app</h2>
      <ul>
        <li>
          <strong>Mobile:</strong> More &rarr; Account &amp; security &rarr; Delete account. You&apos;ll be asked
          to type your account email to confirm.
        </li>
        <li>
          <strong>Web:</strong> Account &rarr; Security &rarr; Delete account, with the same email confirmation.
        </li>
      </ul>

      <h2>What happens</h2>
      <p>
        Deleting removes your envelopes, transactions, budgets, subscriptions, investments, and chat history.
        It&apos;s recoverable for 7 days &mdash; sign back in during that window and you&apos;ll see a Restore
        option &mdash; after which it&apos;s permanently deleted, including your account with our identity
        provider.
      </p>

      <h2>Can&apos;t sign in?</h2>
      <p>
        If you&apos;ve lost access to your account and can&apos;t use the in-app flow, email{' '}
        <strong>{SUPPORT_EMAIL}</strong> from the address on the account and we&apos;ll delete it for you.
      </p>

      <p>
        For what we collect and how it&apos;s handled, see the full{' '}
        <a href="/legal/privacy">Privacy Policy</a>.
      </p>
    </article>
  )
}
