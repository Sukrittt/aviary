# Transactional email

New accounts queue their welcome email atomically with the `users` insert.
Web email/Google authentication and Mobile’s `/api/auth/verify` schedule delivery
with Next.js `after`, once the sign-in response has finished. Existing users
without a queued welcome are never emailed retroactively.

Set `RESEND_API_KEY` on the deployed server. The default sender is
`Aviary <hello@useaviary.com>`; `RESEND_FROM_EMAIL` can override it.
`RESEND_REPLY_TO` defaults to the support address on the Contact page.
Both HTML and plain text are sent; the HTML uses Aviary’s light theme tokens,
system fonts, one primary action, and inline table layouts. Welcome copy explains
account creation and setup without promotional headlines or external font requests.

Delivery state and the frozen message live in `users.welcomeEmail`, which is
excluded from the public profile. Atomic leases prevent concurrent sends;
`welcome/<user-id>` is the Resend idempotency key. A successful send records its
provider id. Failures retry on later sign-ins and the daily `/api/cron/emails`
job, which requires `Authorization: Bearer <CRON_SECRET>` and handles at most
four welcome and four subscription messages per run. Run history and a manual retry action are available in
`/admin/jobs`. Deleted or unverified accounts are skipped.

Resend retains idempotency keys for 24 hours. An uncertain send older than
23 hours becomes `needs_review` instead of risking a second email. Check
Resend’s logs for the recipient and original subject: if sent, record its id
and set the state to `sent`; if definitely unsent, clear `firstAttemptAt`, set
`nextAttemptAt` to now and state to `pending`. A definitive API rejection
(such as rate limiting) has no uncertain-send deadline and can retry later.


Subscription notifications are marked on new authenticated billing events and
queued only after provider verification succeeds. Old events without a marker
are not replayed as emails. Razorpay charged events and RevenueCat initial
purchases/renewals send payment confirmations; trials, free RevenueCat purchases,
promotional grants and sandbox events do not. Razorpay pending/halted and
RevenueCat billing issues send payment-attention emails. User/developer
cancellations send renewal-off confirmations; refunds and billing-error
cancellations are excluded from that message.

Frozen subscription messages live in `email_outbox`, deduplicated by provider,
user, purchase, kind and transaction/billing cycle. Provider redeliveries and
pending/halted notices for the same cycle do not create another message. Web
cancellation writes a durable marker alongside the cancellation state; the
response worker or email cron queues its confirmation, deduplicating the eventual
provider webhook. Failed webhook verification is repaired by the billing cron
before email preparation. Delayed failure events are suppressed when verification
shows the subscription has recovered. Google Play emails link to Play subscription
settings; web emails link to Aviary Account. No payment instrument data is stored.

Subscription delivery shares the welcome worker's leases, retry semantics and
23-hour uncertain-send safeguard. Outbox rows are removed when the account is
purged. Run `npm run db:indexes` when deploying to create the outbox query indexes.
The native unique `_id` provides outbox deduplication even before those indexes
exist. Existing unique billing event indexes are required for webhook ingestion.

Content changes cannot guarantee Gmail inbox placement. Inspect the actual Gmail
spam banner and Show original SPF/DKIM/DMARC results before attributing a delivery
to content or authentication. Check Resend domain verification, delivery logs and
domain reputation as well. No DNS settings are changed by this integration.

If a queued message's recipient no longer matches the verified account email,
its frozen payload is held as `needs_review` and is not sent. Keep that payload
and idempotency key unchanged when inspecting an uncertain earlier delivery.
