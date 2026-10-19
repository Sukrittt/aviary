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

# Lifecycle email

Trial nudges, salary planner follow-ups and the evergreen "let it run" tips
(`lib/email/lifecycle.ts`). They're off until **Send lifecycle emails** is
switched on in `/admin/system`. Off means nothing new is queued. Welcome,
billing and a salary plan someone just asked for still send.

They go from `Sukrit from Aviary <hello@…>` (same address, same Resend
account), signed by Sukrit, with replies to support. Copy lives in
`lib/email/lifecycleTemplate.ts`.

| Step | When | Who |
| --- | --- | --- |
| `setup-1`, `setup-2` | 1 and 4 days after signup | Never finished setup (no trial yet) |
| `trial-d2` | Trial day 2 to 6 | Trial with nothing logged |
| `trial-d7` | Trial day 7 to 13 | Every trial; copy depends on spends |
| `trial-end` | 5 days before the trial ends | Trial that billing enforces |
| `plan` | When asked for | Salary planner lead |
| `lead-d3`, `lead-d7` | 3 and 7 days after the plan | Lead who clicked "Send me the tips" |
| `tip-*` | Every 6 days, in `EVERGREEN` order | Everyone else, once settled in |

`lib/email/lifecycleSteps.ts` picks one step per person, only the furthest
due, at least 2 days after the last lifecycle email (6 for tips). Each step
has a closed window, so an account past it skips it. New accounts wait a week
before tips; trial accounts start them 6 days after `trial-d7`. To add a tip,
append its id to `EVERGREEN` and its copy to `TIPS`: everyone who's run out
gets it next. Never rename an id.

The outbox rows are the history. Lifecycle rows have `kind: 'lifecycle'`, a
`step`, and `_id` `lifecycle/<user>/<step>` or `lead/<lead>/<step>`, which is
also their Resend idempotency key, so a step is queued once per person.
Subscription rows keep `subscription/<id>` keys. Both go through
`sendOutbox` with the welcome worker's leases and 23-hour safeguard.

The emails cron runs at 06:00, 09:00, 12:00 and 15:00 UTC. Lifecycle is its
own bucket after welcome and billing, at most 15 per run, trial-end notices
first and tips last. Existing accounts join the tips gradually at that rate.

**Unsubscribe.** Every lifecycle email except `trial-end` carries a
`List-Unsubscribe` one-click header and a footer link to `/emails`, where a
button posts the unsubscribe (a GET never changes anything, since mail
scanners open links). Users get `emailOptOutAt`; leads get `optedOutAt`. A
queued tip is dropped at send time if its reader opted out. `trial-end` is an
account notice and sends regardless. Links are HMAC-signed with a key derived
from `CRON_SECRET`, so rotating it breaks unsubscribe links in sent emails;
`/emails` then asks the reader to reply instead.

**Leads.** `POST /api/leads` (the salary planner's "Email me this plan")
rebuilds the plan from salary and rent, stores a `leads` row keyed by a hash
of the address, and sends the plan right away. At most one plan per address
per day, plus an IP rate limit. Follow-ups need the "Send me the tips" click
(`/api/email/confirm`), so a typed-in stranger's address gets one email at
most. Mail scanners that open links can confirm on someone's behalf; the
unsubscribe link covers that. A lead whose address later signs up gets the
account emails instead.

The iOS waitlist isn't emailed: that form promises one email, when the iPhone
app is out.
