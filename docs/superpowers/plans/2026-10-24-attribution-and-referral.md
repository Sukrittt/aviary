# Signup Attribution and Referral Program: Implementation Plan

> Each `### PR` below is one `/ship-pr` run. Web PRs target `staging`; Mobile PRs target Mobile `staging`.

**Goal:** Know the source of every new account (PostHog breakdown + a per-user field), then turn every channel into a multiplier with a two-sided referral: both sides get 1 month of Pro once the new user is activated. Creator/ambassador codes use the same mechanism with a custom reward and landing offer.

**Architecture:** Attribution is captured as a first-party cookie by `middleware.ts` (web) or the Play install referrer (Android). It reaches the server on the request that creates the `users` row. `ensureUser` stores it once as `users.signupSource` and fires one server-side PostHog `user_signed_up` event. Referrals use two small collections: `referral_codes` (`_id` = code) and `referrals` (`_id` = referee id). Rewards go through one tested lib function that picks the mechanism per billing state (trial extension, `comp` gift, or RevenueCat Play deferral).

**Tech stack:** Next.js route handlers + server actions, MongoDB, Vitest (+ `mongodb-memory-server` for DB rules), PostHog capture HTTP API via `fetch` (no `posthog-node`), Expo `expo-application.getInstallReferrerAsync` (already installed), RevenueCat REST v1.

## Findings

**Existing attribution work** (both repos, all branches, PRs): no UTM/referrer capture exists anywhere. The "being built separately" work is these pieces, which this plan extends:
- `heardFrom` self-report: `lib/users.ts:12,58` and `src/components/onboarding/HeardFrom.tsx` (web PR via `PATCH /api/user`; Mobile PR #188, same component name).
- "Invite a friend" (Web PR #173 `app/account/page.tsx:72`, Mobile PR #210 `app/(tabs)/more.tsx:697-704`): shares `/?ref=invite`, which becomes the PostHog super property `ref` (`src/lib/analytics.ts:209-212`). No codes, no rewards.
- Lifecycle emails already tag `utm_source=email&utm_medium=lifecycle` (`lib/email/lifecycleTemplate.ts:12`).

**PostHog today:**
- Client only: web `posthog-js`, mobile `posthog-react-native`, both production-only. `identify(workosUserId)` runs on both, and `platform` is registered as a super property.
- **`account_created` is not a signup event.** It fires when a money account is added (`src/hooks/useAccounts.ts:23`, the same in Mobile). No event marks "new user". `sign_in_completed` fires on every login.
- Web `before_send` strips query strings from `$current_url`/`$referrer`, but PostHog's own `$utm_*` properties survive. Those only exist on web pageviews, never on Android.

**How signup carries state:**
- Landing CTAs go to `/sign-in` with no params, or to `PLAY_STORE_URL` (`src/components/billing/copy.ts:3`, a plain link with no `referrer`).
- Web sign-in is Google OAuth (`state` = nonce only, cookie `oauth_state`) or a magic code (`/email` → `/code`). The only state that survives either path is the client cookie `aviary-return` (`src/lib/returnTo.ts`, 30 min, SameSite=Lax). `/join/[code]` uses it to return after sign-in.
- The user row is created by `ensureUser` (`lib/users.ts:100`). Its callers are `google/callback/route.ts:64`, `magic-auth/verify/route.ts:71`, `auth/verify/route.ts:17`, and `GET /api/user` (JIT via `ensureUserById`, which is mobile Google's path). It returns `void`, so no caller knows a row was inserted.
- `middleware.ts` runs on every non-static request and redirects signed-in `/` to `/expense`. It touches no attribution.
- Mobile: Google is WorkOS PKCE directly, and the row is created by the first `GET /api/user`. Email goes through `POST /api/auth/magic-auth/verify {email, code, device}`. No install referrer is read today. `expo-application` (already a dependency) bundles `installreferrer:2.2` and exposes `getInstallReferrerAsync()`.

**Gift-grant path** (`app/admin/subscriptions/actions.ts:49-68`, `grantGiftAction`):
- It writes `billing_accounts.comp = { until, reason, grantedBy, grantedAt }` directly. There is no lib function.
- It stacks on a live gift, and needs a billing account, which exists only after onboarding (`completeOnboarding` → `startTrial`).
- Access is `purchased || gifted` (`lib/billing/access.ts:126`), so **a gift overlaps paid time rather than following it**.
- No provider path writes `comp` or `trialEndsAt`, so renewals never overwrite a gift.
- Related gaps:
  - **Retention ignores `comp`.** `accessEndedAt` (`lib/billing/lifecycle.ts:52`) only looks at `trialEndsAt` and `expiresAt`. After a long gift, the deletion deadline can be in the past and warning mails are skipped.
  - **Razorpay/PayPal subscribe charges a gifted user immediately.** The first charge is deferred only in `mode === 'trial'` (`razorpay/subscribe/route.ts:50`, `paypal/subscribe/route.ts:47`), so a referral month would be wasted the moment the user subscribes.
- Admin trial extension uses `extendTrialEnd` (`access.ts:100`), and that path keeps Razorpay's deferred first charge correct.
- Play billing is RevenueCat. Its v1 API has `POST /subscribers/{id}/subscriptions/{subscription_id}/defer` (calls Google's `subscriptions.defer`, secret key, Subscription ID without the `:basePlan` suffix, webhook not guaranteed).

**Invite-link mechanism:**
- Web `/join/[code]` (public page) sets `aviary-return`, sends the user through sign-in, and posts `/api/join/[code]`. Codes are 6 chars, stored in `space_invites` (unique `code` index).
- Mobile `pendingJoin` keeps the code in memory only (`src/lib/pendingJoin.ts`). It's captured in `app/+native-intent.ts` for `/join/*` App Links and consumed in `_layout.tsx:358`.
- App Links / assetlinks cover `/join/*` only (`lib/appLinks.ts`, `app.json`).

**Activation signals that exist:** `users.onboardedAt`, `manualTransactionCompletedAt`, `guidedTourCompletedAt`. There is no stored expense count. Admin counts expenses live.

## Decisions

1. **New signup event `user_signed_up`, fired server-side.** `account_created` already means "money account added". Renaming it would break existing insights.
2. **Server-side capture via the PostHog HTTP API** (`fetch` in `after()`), `distinct_id` = WorkOS id. It covers all four creation paths, including mobile Google JIT. No new dependency.
3. **Store `users.signupSource` (one field, no new collection).** Referrals and abuse checks need it server-side anyway, and admin user pages can show it.
4. **Web capture lives in middleware.** On a GET document request with UTM params, `?ref=`, or an external `Referer`, set the 30-day cookie `aviary_attr`. Rules:
   - Last touch wins when the request carries UTMs or a ref.
   - Otherwise the first touch is kept.
   - The cookie is first-party and readable by the client, so the Play link can reuse it.
5. **Android capture uses `getInstallReferrerAsync()` once on first launch**, stored in AsyncStorage. While it's stored, every request sends it as header `x-aviary-attribution`, cleared after the first `GET /api/user` succeeds. The server stores it only on insert, so upgrades of existing users are ignored.
6. **One `source` property for breakdowns:** `utm_source`, else `referral` when a code is present, else `referrer_domain`, else `direct`.
7. **Code format:**
   - User codes are 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L), created lazily on first open of Refer.
   - Collision handling: the duplicate-key error on `_id` triggers a retry (5×).
   - Vanity creator codes are `[A-Z0-9]{3,16}`, set in admin, and case-insensitive (stored uppercase).
   - Codes live in `referral_codes` rather than on the user doc. `_id` uniqueness gives collision safety for both user and vanity codes for free, and creator codes have no user.
8. **Activation means onboarding finished, plus expenses created on 3 different days, within 30 days of signup.**
   - This measures the habit Aviary sells.
   - It's slow to fake: it takes 3 real days, and only server `createdAt` counts, not backdated `date`.
   - Imports don't count: only `source` manual/capture/scan expenses are counted.
   - It's checked in `after()` on expense POST, but only when a `pending` referral exists for the user (a single `_id` lookup).
9. **Reward mechanics.** One pure planner `planReward(snapshot)` picks the mechanism, and `grantReward` applies it:

   | State | Mechanism |
   |---|---|
   | In trial, no purchase | `trialEndsAt = addMonthsUtc(max(trialEndsAt, now), 1)`. Keeps the Razorpay deferred first charge right. |
   | Gift live | Stack `comp.until` by +1 month (same as admin). |
   | Expired / never paid | `comp.until = now + 1 month`. |
   | Play, auto-renewing | RevenueCat defer of the next renewal by +1 month, then `refreshFromProvider`. If the defer errors, fall back to the next row. |
   | Paid, not renewing (any provider) | `comp.until = max(expiresAt, comp.until, now) + 1 month`. Access is contiguous after the paid period. |
   | Razorpay/PayPal, auto-renewing | **Open question 1.** Default: bank it as `comp` starting at `expiresAt` (same as the row above). Copy says "Your free month is added after your current paid period." |
   | No billing account (referrer never onboarded) | Status `held`. It's granted by the activation check of their own onboarding, via `completeOnboarding`. |

10. **Both sides are rewarded at activation, not at signup.** Signups that never use the app cost nothing.
11. **Redemption rules:**
    - One referrer per account (`referrals._id` = referee id).
    - Applied only at account creation (link or install referrer). There's no manual code entry: the link is the only way in.
    - Blocked when:
      - the code owner is the referee;
      - the referee and owner emails match after `+tag` and dot normalisation for Gmail;
      - the referee's email is unverified;
      - the referee's email domain is in a small static disposable list (`lib/referrals/disposable.ts`, about 40 domains, no package).
    - Blocked referrals are stored with a `reason` and never rewarded.
12. **Cap:** a referrer earns at most 3 months per calendar month. Activations beyond the cap still reward the referee and are marked `capped` for the referrer. Creator codes have `referrerMonths: 0` by default (creators are paid outside the app), so no cap applies.
13. **No App Link for `/r/*`.** A web landing that forwards to Play with the referrer is enough. People who already have the app don't need a referral.
14. **Refer replaces "Invite a friend"** on web and mobile. `/?ref=invite` keeps working because the cookie captures `ref`.

## Global Constraints

- No new dependencies, no new Vercel crons. Activation runs on expense writes, and held rewards are granted in `completeOnboarding`.
- Tests are written first for: attribution parsing, `planReward`/`grantReward`, `accessEndedAt` with `comp`, subscribe deferral with `comp`, the redemption rules, the activation count, and the cap.
- Copy: plain, second person, sentence case, no em dashes (Mobile lint fails on them), no hype. The server returns error codes and the clients map them to copy.
- Analytics stays production-only. Server capture is gated on `VERCEL_ENV === 'production'` and reuses `NEXT_PUBLIC_POSTHOG_KEY`/`HOST` (no new env).
- `npm run typecheck && npm run lint && npm test` before each commit. Run `npm run db:indexes` against prod (`/expenses` URI) after W3 deploys (release-checklist-extras).
- Product constraints hold: no balances, SMS or IOUs are introduced.

## Review Focus

1. Reddit comment → web landing → Play install → Android Google sign-in. Expected: `user_signed_up` has `utm_source=reddit`, `platform=android`. Pinned in W1 (Play link carries the cookie) and M1 (header on the JIT `GET /api/user`).
2. A trial user referred by a trial user activates. Expected: both `trialEndsAt` move +1 month, and a Razorpay subscribe afterwards still defers the first charge to the new end. Pinned in W2 and W3.
3. A Play auto-renewing referrer. Expected: one RevenueCat defer call, no `comp`, and the projection refreshed. Double activation (a retried `after()`) makes no second defer, because `rewardedAt` is guarded by a conditional update. Pinned in W2 and W3.
4. Self-referral via the same Gmail with a `+tag`. Expected: `blocked:self`. Pinned in W3.
5. A gift that ends after a long comp. Expected: the retention deadline counts from `comp.until`. Pinned in W2.

---

### PR W1 (Web): signup attribution + `user_signed_up`

**Files:**
- Create:
  - `lib/attribution.ts` + test
  - `lib/posthogServer.ts` + test
  - `docs/superpowers/plans/2026-10-24-attribution-and-referral.md`
- Modify:
  - `middleware.ts` + `middleware.test.ts`
  - `lib/users.ts`: `signupSource` on `UserDoc`; `ensureUser(user, attribution?)` returns `{ inserted }` using `upsertedId`
  - the 4 `ensureUser` callers (pass `readAttribution(request)`)
  - `src/components/billing/copy.ts`: `playStoreUrl(attr?)`
  - `Chrome.tsx`, `LandingPage.tsx`, `GetAppDialog.tsx` (use `playStoreUrl`)
  - `app/admin/users/[id]/page.tsx` (show source)

**Interfaces:**
- `Attribution = { utm_source?, utm_medium?, utm_campaign?, referrer_domain?, landing_path?, referral_code?, platform: 'web'|'android' }`, every field clipped to 64 chars, `[\w.:\-/ ]` only.
- `attributionFromUrl(url, referer, host)` gives the middleware cookie payload. An internal referrer counts as no referrer, and `?ref=` maps to `referral_code` only when it matches the code shape (otherwise to `utm_campaign`, e.g. `invite`).
- `readAttribution(req)` reads the cookie `aviary_attr` or the header `x-aviary-attribution` (JSON, max 1 KB). Invalid input returns null.
- `playStoreUrl(attr)` builds `…&referrer=` + `encodeURIComponent('utm_source=…&utm_medium=…&utm_campaign=…&ref=…')`.
- `sourceOf(attr)` follows Decision 6.
- `captureServer(distinctId, event, props)`: fire-and-forget POST to `${HOST}/i/v0/e/`. It swallows errors.
- On insert, `user_signed_up` is captured with all `Attribution` fields plus `source` and `method` (google/email/jit), and `$set_once: { signup_source, signup_utm_source, signup_platform }` so person-level breakdowns work too.

- [ ] Tests first:
  - UTM parse, clipping and injection chars dropped.
  - An external referrer becomes its domain; an internal one becomes nothing.
  - Last-touch on UTMs, first-touch otherwise.
  - Header beats cookie for mobile.
  - `playStoreUrl` round-trips through `URLSearchParams`.
  - `ensureUser` stores `signupSource` only on insert and reports `inserted` (memory replset).
  - Capture is skipped outside production.
- [ ] Commit `feat(analytics): capture signup source and fire user_signed_up`.
- [ ] Rollout, after the prod deploy:
  - Use the PostHog MCP to create the insight "Signups by source, last 30 days": Trends on `user_signed_up`, breakdown `source`, 30d, saved to the main dashboard. Record its short id in `marketing/utm.md` for the daily app-analysis task.
  - Check the prod deploy actually happened (vercel-deploy-quota).

### Root repo (not a ship-pr): `marketing/utm.md`

The root repo isn't a ship-pr target, so this is a direct commit on `master`. It gets a table of canonical links:

| Channel | `utm_source` | `utm_medium` | `utm_campaign` |
|---|---|---|---|
| Reddit | `reddit` | `comment` | subreddit |
| Instagram | `instagram` | `reel` / `bio` | reel slug |
| Product Hunt | `producthunt` | `launch` | — |
| AlternativeTo etc. | `alternativeto` | `directory` | — |
| Cold email | `email` | `outreach` | batch |
| Creators | `creator` | `sponsor` | name, plus their `/r/CODE` |

It also covers:
- The Play link format with `referrer=`.
- A one-line `node -e` snippet that prints both the web link and the Play link for a given source.
- The insight id.

No script file is needed; the snippet in the doc is enough.

### PR M1 (Mobile): install referrer → signup

**Files:**
- Create: `src/lib/attribution.ts` + test
- Modify:
  - `app/_layout.tsx`: call `captureInstallReferrer()` once on boot, Android only
  - `src/api/client.ts`: attach the `x-aviary-attribution` header while stored
  - `src/api/magicAuth.ts`: same header on verify

**Behaviour:**
- Read `getInstallReferrerAsync()` once. The flag `attr-captured` lives in AsyncStorage.
- Parse it with `URLSearchParams` into the `Attribution` shape (with `platform: 'android'`) and store it.
- Clear it after the first successful `GET /api/user`.
- Failures (non-Play installs, emulators) are silent.

- [ ] Tests:
  - Parsing `utm_source=reddit&utm_campaign=r%2Fpersonalfinanceindia&ref=K7QM4P`.
  - The Google Play organic referrer becomes `utm_source=google-play`.
  - The header is sent until the first `/api/user` 200, then dropped.
  - It's captured only once.
- [ ] Commit `feat(analytics): send Play install referrer with signup`.
- [ ] Rollout:
  - Native module is already in the build, but a new JS call on the native module → ship with next store build (AAB manual upload), not OTA, to be safe.
  - Web W1 must be live on prod first.

### PR W2 (Web): billing groundwork for rewards (TDD)

**Files:**
- Create: `lib/billing/reward.ts` + test
- Modify:
  - `lib/billing/lifecycle.ts` (+test): `accessEndedAt` includes `comp.until`
  - `app/api/billing/razorpay/subscribe/route.ts`, `paypal/subscribe/route.ts` (+tests): defer the first charge to `max(trialEndsAt, comp.until)` when either is in the future
  - `lib/billing/revenuecat.ts`: `deferGoogleSubscription(appUserId, subscriptionId, newExpiry)`
  - `app/admin/subscriptions/actions.ts`: `grantGiftAction` calls the new `grantComp` (behaviour unchanged, existing tests stay green)

**Interfaces:**
- `planReward({ now, account, subscription }): { kind: 'extend_trial' | 'comp_from' | 'play_defer' | 'hold'; from?: Date; until: Date }`. It's pure and covers every row of Decision 9.
- `grantComp(userId, months, reason, by, from?)` holds the lifted admin logic. With `from`, the comp starts at that date.
- `grantReward(userId, months, reason): Promise<{ kind, until }>` applies the plan and calls `refreshFromProvider` after a Play defer.
  - Idempotency belongs to the caller (W3 uses a conditional update).
  - It writes an `admin_audit` row with actor `system:referral`.

- [ ] Write a failing test per row of Decision 9 plus the defer-error fallback, the month-end clamp (31 Jan), the retention deadline with `comp`, and Razorpay `start_at` = `comp.until`. Implement, then go green.
- [ ] Commit `feat(billing): reward months that respect trial, gift and Play renewals`.
- [ ] Rollout: needs `REVENUECAT_SECRET_KEY` scope for defer. Check the existing key has write permission on staging with a sandbox subscription first.

### PR W3 (Web): referral core

**Files:**
- Create:
  - `lib/referrals/{codes,apply,activate,disposable}.ts` + tests
  - `app/api/referrals/me/route.ts` (GET code + stats)
- Modify:
  - `lib/models.ts` (`referral_codes`, `referrals`)
  - `scripts/ensure-indexes.mjs`: `referral_codes` gets `ownerId` unique sparse; `referrals` gets `referrerId+rewardedAt` and `code+status`
  - `lib/users.ts` / the `ensureUser` insert path: apply `attribution.referral_code` on insert
  - `app/api/expenses/route.ts`: `after(() => maybeActivate(userId))`
  - `lib/billing/service.ts` `completeOnboarding`: grant `held` rewards, run `maybeActivate`
  - `src/lib/analytics.ts` (event names)

**Data:**
- `ReferralCodeDoc = { _id: code, kind: 'user'|'creator', ownerId: string|null, label: string|null, refereeMonths: number, referrerMonths: number, offer: string|null, active: boolean, createdAt }`
- `ReferralDoc = { _id: refereeId, code, referrerId: string|null, kind, status: 'pending'|'activated'|'blocked', reason?, appliedVia: 'link'|'install'|'manual', appliedAt, activatedAt?, referee: { kind, until, at }?, referrer: { kind, until, at } | { capped: true }? }`

**Rules:**
- `applyReferral(userId, code, via)` returns `'applied' | 'not_found' | 'inactive' | 'own_code' | 'already_referred' | 'blocked'` (blocked is stored, the others are not).
- `maybeActivate(userId)`:
  - Runs only when the referral is pending, the user is onboarded, and there are 3 distinct days of qualifying expense `createdAt` (in the user's timezone) within 30 days.
  - Activation is a conditional `updateOne({_id, status:'pending'}, {$set:{status:'activated'}})`; only the winner grants.
  - Then `grantReward` for the referee and, under the cap, for the referrer.
- Server events: `referral_code_applied {code, kind, via}`, `referral_activated`, `referral_rewarded {side, kind}`.
- `GET /api/referrals/me` returns `{ code, link, joined, activated, monthsEarned, referredBy? }`.

- [ ] Tests first (memory replset):
  - Each apply outcome, including Gmail dot/`+tag` self-match and a disposable domain.
  - The 7-day window.
  - Activation needs 3 distinct days: 3 expenses on one day doesn't count, and imported expenses don't count.
  - A double `maybeActivate` grants once.
  - The cap (4th activation in a month gives the referrer `capped`, while the referee is still rewarded).
  - A creator code with `referrerMonths: 0` grants the referee only.
  - A held reward is granted at `completeOnboarding`.
  - Code collisions retry.
- [ ] Commit `feat(referrals): codes, redemption, activation and rewards`.
- [ ] Rollout: run `db:indexes` on dev, then on prod after the deploy.

### PR W4 (Web): admin referrals + creator codes

Ordered before the user-facing UI so creator codes exist for the Product Hunt launch on 2026-11-10.

**Files:**
- Create: `app/admin/referrals/page.tsx`, `app/admin/referrals/actions.ts` + test
- Modify: `app/admin/AdminNav.tsx`, `app/admin/audit/summarize.ts` (`referral.code_create`, `referral.code_toggle`)

**What it does:**
- Per-code table: code, kind, owner/label, applied, activated, rewarded, last applied. Follows the `adm-table` pattern from `app/admin/users/page.tsx`.
- Recent referrals with status/reason.
- Create-code form: code, label, referee months (1-12), referrer months (0-12), offer line (≤120 chars), active.
- Deactivate toggle.

- [ ] Tests: invalid vanity code, a duplicate code, months bounds, and that `requireAdmin` is enforced.
- [ ] Commit `feat(admin): referral codes and conversions`.

### PR W5 (Web): `/r/[code]` landing, Refer page, code entry

**Files:**
- Create:
  - `app/(auth)/r/[code]/page.tsx` + `route`-free server component
  - `src/views/ReferLanding.tsx`
  - `app/account/refer/page.tsx`, `src/components/account/ReferPanel.tsx` + tests
- Modify:
  - `middleware.ts`: on `/r/CODE`, set `aviary_attr` with `utm_source=referral|creator`, `utm_campaign=CODE`, `referral_code=CODE`
  - `app/account/page.tsx`: the Refer row replaces Invite a friend
  - `src/lib/analytics.ts`: `referral_link_shared {method}`
  - `app/sitemap.ts` excludes `/r/`

**Landing:**
- The owner's first name only, or the creator offer.
- Two CTAs: "Get it on Android" (`playStoreUrl(attr)`) and "Use it on the web" (`/sign-in`).
- Unknown or inactive codes still render the generic landing (no error page) without setting a code.

- [ ] Tests:
  - `/r/k7qm4p` sets the cookie with an uppercased code.
  - The Play href carries `ref=K7QM4P`.
  - The Refer panel shows the code, link and stats.
  - The entry field maps each error code to copy.
- [ ] Commit `feat(referrals): refer page, invite landing and code entry on web`.

### PR M2 (Mobile): Refer screen + code entry

**Files:**
- Create: `app/account/refer.tsx` + test, `src/api/referrals.ts`
- Modify:
  - `app/_layout.tsx` (register the `account/refer` route in the `signedIn` block)
  - `app/(tabs)/more.tsx` (Refer row replaces Invite a friend; drop the duplicate divider at `:435/438`)
  - `src/components/onboarding/HeardFrom.tsx` (friend → code field, reusing `CodeTiles` with `length` 6 plus a free-text fallback for vanity codes)
  - `src/lib/analytics.ts` (`referral_link_shared`)

**Share:** RN `Share.share({ message })`, the same as the existing invite.

- [ ] Tests: share fires the event and the message contains the link; code entry error mapping; the row is navigable.
- [ ] Commit `feat(referrals): refer a friend on Android`.
- [ ] Rollout: ships OTA if no native change (none expected). Otherwise it goes with the next AAB, alongside M1.

## Copy (drafts)

**Refer screen**
- Title: "Give a month, get a month"
- Body: "Share your link. When a friend sets up Aviary and logs expenses on three different days, you both get a month of Pro."
- Code block: "Your code · K7QM4P" with buttons "Share link" and "Copy code"
- Stats: "3 friends joined · 1 month earned"
- Cap note: "You can earn up to 3 months each calendar month."
- Paid web subscriber note: "Your free month is added after your current paid period."
- Entry (first 7 days): "Got a code from a friend?" with button "Apply"
- Errors:
  - "That code doesn't exist."
  - "Codes can be added in your first 7 days."
  - "That's your own code."
  - "You've already used a code."
  - "This code can't be used with this account."
- Applied: "Code applied. Log expenses on three different days and you'll both get a month of Pro."

**Share message:** "I plan my spending with Aviary. It tells me what I can still spend this month. Sign up with my link and we both get a month of Pro: https://www.useaviary.com/r/K7QM4P"

**Landing `/r/CODE`:**
- Headline: "Priya invited you to Aviary"
- Body: "Give every rupee a job before you spend it. Join with this link and get a month of Pro on top of your free trial."
  - For intl visitors, swap to: "Know what you can spend before you spend it."
- Creator variant: the headline is the admin `offer`.

## Verification

- `npm run typecheck && npm run lint && npm test` (Web) and the same in Mobile, per PR.
- **Staging E2E** (Playwright, using the web-qa-login-playwright memory):
  1. Open `/?utm_source=reddit&utm_campaign=test` and sign up with a fresh email.
  2. Check `users.signupSource` in `expenses-dev`.
  3. Check that `user_signed_up` is skipped on staging but logged in dev.
- **Referral E2E on staging:**
  1. User A opens Refer.
  2. User B signs up via `/r/CODE` and onboards.
  3. Seed 3 expenses with `createdAt` on 3 days via a script against `expenses-dev`.
  4. Check both `trialEndsAt` values moved +1 month, the `referrals` doc is `activated`, and the admin page counts it.
- **Play:**
  - Internal-track build: install via `https://play.google.com/store/apps/details?id=com.sukrit04.envelope&referrer=utm_source%3Dtest%26ref%3DCODE`.
  - Check the referrer reaches `signupSource` (the referrer only populates for Play-delivered installs).
  - Sandbox subscription defer via the RevenueCat dashboard history.
- **After the prod deploy:** check the PostHog insight shows `user_signed_up` within a day.

## Decided (2026-10-24)

1. Auto-renewing Razorpay/PayPal referrers: the month is banked as `comp` starting at the end of the paid period. No refunds.
2. Creator codes give the creator no Pro months by default (`referrerMonths: 0`).
3. Activation: setup finished plus expenses created on 3 different days within 30 days of signup.

## Changes during build

- W1: public "Get the app" links go through `/get/android`, a redirect that reads `aviary_attr` server-side and builds the Play link with the install referrer. Landing pages stay server components. `/get/android?utm_source=…` also works as a tagged Play link on its own.
