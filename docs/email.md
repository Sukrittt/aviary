# Welcome email

New accounts queue their welcome email atomically with the `users` insert.
Web email/Google authentication and Mobile’s `/api/auth/verify` schedule delivery
with Next.js `after`, once the sign-in response has finished. Existing users
without a queued welcome are never emailed retroactively.

Set `RESEND_API_KEY` on the deployed server. The default sender is
`Aviary <hello@useaviary.com>`; `RESEND_FROM_EMAIL` can override it.
`RESEND_REPLY_TO` defaults to the support address on the Contact page.
Both HTML and plain text are sent; the HTML uses Aviary’s light theme tokens,
bird icon, Fredoka/Nunito with email-safe fallbacks, and inline table layouts.

Delivery state and the frozen message live in `users.welcomeEmail`, which is
excluded from the public profile. Atomic leases prevent concurrent sends;
`welcome/<user-id>` is the Resend idempotency key. A successful send records its
provider id. Failures retry on later sign-ins and the daily `/api/cron/emails`
job, which requires `Authorization: Bearer <CRON_SECRET>` and handles at most
eight messages per run. Run history and a manual retry action are available in
`/admin/jobs`. Deleted or unverified accounts are skipped.

Resend retains idempotency keys for 24 hours. An uncertain send older than
23 hours becomes `needs_review` instead of risking a second email. Check
Resend’s logs for the recipient and original subject: if sent, record its id
and set the state to `sent`; if definitely unsent, clear `firstAttemptAt`, set
`nextAttemptAt` to now and state to `pending`. A definitive API rejection
(such as rate limiting) has no uncertain-send deadline and can retry later.
