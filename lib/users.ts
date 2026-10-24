import { getDb } from './mongodb'
import { getWorkOSClient } from './workosClient'
import { resolveCurrency } from '@/src/lib/currencies'
import { purgesAt } from './archive'
import { queueWelcomeEmail, type WelcomeDelivery } from './email/welcome'
import { sourceOf, type SignupSource } from './attribution'
import { captureLater } from './posthogServer'

/** Features a user can hide from Mobile's More page for a simpler app. Hiding removes entry points only; data is untouched. */
export const HIDEABLE_FEATURES = ['askAviary', 'investments', 'billScan', 'recurring', 'subscriptions', 'insights', 'wrapped', 'income', 'accounts'] as const
export type HideableFeature = (typeof HIDEABLE_FEATURES)[number]

/** Answers to setup's "Where did you hear about us?". Twin of Mobile's HeardFrom.tsx options. */
export const HEARD_FROM_SOURCES = ['friend', 'search', 'social', 'reddit', 'youtube', 'appStore', 'article', 'other'] as const
export type HeardFrom = (typeof HEARD_FROM_SOURCES)[number]

export interface UserDoc {
  currencyCode?: string
  /** IANA zone (e.g. `America/New_York`) reported by the client. Absent = IST, which is what every pre-existing account was. */
  timezone?: string
  _id: string
  email: string
  /**
   * Mirrors the WorkOS user's `emailVerified`. Missing on docs from before this
   * field existed — safe to default to `true`: AuthKit requires a verified
   * email to complete sign-in (`isEmailVerificationRequired`), so any user who
   * already has a session got here with a verified address.
   */
  emailVerified?: boolean
  name: string | null
  avatarUrl: string | null
  createdAt: Date
  /** Server-only welcome delivery, seeded on insert so existing accounts are never emailed retroactively. */
  welcomeEmail?: WelcomeDelivery
  /** Turned off lifecycle and evergreen emails via the signed unsubscribe link. Welcome, billing and the trial-end notice still send. */
  emailOptOutAt?: Date
  onboardedAt?: string | null
  /** When the first-week recap was opened, on any device. Server-set, once. */
  weekRecapSeenAt?: string | null
  /** Server-owned milestones used by Mobile's finite Home "Get started" card. */
  getStartedAt?: string | null
  manualTransactionCompletedAt?: string | null
  guidedTourCompletedAt?: string | null
  /** Web releases already announced. Server-owned, atomic across tabs/devices. */
  seenWebChangelogIds?: string[]
  /** Mobile releases already announced, tracked apart from web's. */
  seenMobileChangelogIds?: string[]
  notifyCadence?: 'off' | 'weekly' | 'daily'
  /** Category limit alerts (threshold + overspent) — independent of `notifyCadence`, which only gates the digest. */
  notifyThresholds?: boolean
  notifyBills?: boolean
  notifyBillLeadDays?: number
  notifyCoach?: boolean
  /** Push when a new monthly Wrapped edition unlocks — independent of `notifyCadence`. */
  notifyWrapped?: boolean
  hiddenFeatures?: HideableFeature[]
  /** Activity can show expenses as a photo feed. Off unless turned on in More → Features. */
  activityFeed?: boolean
  /** Setup's "Where did you hear about us?" answer. Absent = skipped or signed up before it was asked. */
  heardFrom?: HeardFrom
  /** Where the account came from (UTM tags, referrer, code, platform). Server-set once, on insert. See lib/attribution.ts. */
  signupSource?: SignupSource
  /** Legacy fields from before the flat `name` field — read via `displayName`, never written. */
  firstName?: string | null
  lastName?: string | null
  /** Grants /admin. Set only by scripts/grant-admin.mjs — never writable from any route. */
  isAdmin?: boolean
  /** Subject to the billing switches while `billing.audience` is `testers`. Set only by scripts/grant-billing-tester.mjs. */
  billingTester?: boolean
  /** Last authenticated request, stamped at most hourly by lib/lastSeen.ts. */
  lastSeenAt?: Date
  /** Furthest come-back nudge sent for the current quiet spell, keyed by its last-seen date. Server-owned, see lib/notifications/reengage.ts. */
  lastReengage?: { lapse: string; step: number }
  /** How many budgets this person may open. Absent = 5. Set only by an admin, from /admin/users. */
  budgetLimit?: number | null
  /**
   * True for someone who only ever joined other people's budgets: they have
   * no personal budget (and no trial) until they make one of their own.
   */
  noPersonalBudget?: boolean
  /** Set when the account is soft-deleted; the GC cron purges the account (and its WorkOS user) `GRACE_DAYS` after this. Null/absent = active. */
  deleted_at?: string | null
  account_deletion_version?: 1
}

interface WorkOSUserLike {
  id: string
  email: string
  emailVerified?: boolean
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  profilePictureUrl?: string | null
}

/** The user's display name, falling back to the pre-migration first/last name fields. */
export function displayName(doc: Pick<UserDoc, 'name' | 'firstName' | 'lastName'>): string | null {
  if (doc.name) return doc.name
  const legacy = [doc.firstName, doc.lastName].filter(Boolean).join(' ').trim()
  return legacy || null
}

/** How the account was created, for the signup event: web Google callback, magic code (web or app), or the app's first request after Google. */
export type SignupMethod = 'google' | 'email' | 'jit'

/**
 * Upsert from a WorkOS user object already in hand — e.g. a fresh authenticate
 * response. When this creates the row it stores `source` and reports the
 * signup to PostHog (`user_signed_up`), the one place every new account passes.
 */
export async function ensureUser(user: WorkOSUserLike, source?: SignupSource, method: SignupMethod = 'jit'): Promise<{ inserted: boolean }> {
  const db = await getDb()
  const name = user.name || [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || null
  const res = await db.collection<UserDoc>('users').updateOne(
    { _id: user.id },
    {
      // Email, its verified state, and avatar are authoritative in WorkOS, so
      // every sign-in refreshes them.
      $set: { email: user.email, emailVerified: user.emailVerified ?? true, avatarUrl: user.profilePictureUrl ?? null },
      // Name is authoritative in this app once set — a Google sign-in must not overwrite
      // a rename the user made here, so it's only ever seeded on first insert.
      $setOnInsert: {
        _id: user.id,
        name,
        createdAt: new Date(),
        welcomeEmail: queueWelcomeEmail({ email: user.email, name }),
        currencyCode: 'INR',
        // Digest is opt-out, not opt-in: a new account with notifications off
        // never hears from the app again. Seeded only on insert, so an existing
        // user who chose 'off' stays off.
        notifyCadence: 'daily',
        ...(source ? { signupSource: source } : {}),
      },
    },
    { upsert: true },
  )
  const inserted = res.upsertedCount > 0
  if (inserted && source?.referral_code) {
    // Imported here, not at the top: lib/users is everywhere, referrals pulls in billing.
    const { applyReferral } = await import('./referrals')
    await applyReferral(user.id, source.referral_code, source.platform === 'android' ? 'install' : 'link')
      .catch((err) => console.error('referrals: applying the signup code failed', user.id, err))
  }
  if (inserted) {
    const s = source ?? { platform: 'web' as const }
    captureLater(user.id, 'user_signed_up', {
      ...s,
      source: sourceOf(s),
      method,
      $set_once: { signup_source: sourceOf(s), signup_utm_source: s.utm_source ?? null, signup_platform: s.platform, signup_referral_code: s.referral_code ?? null },
    })
  }
  return { inserted }
}

/** Upsert by id alone — fetches the WorkOS user only when the local row doesn't exist yet. */
export async function ensureUserById(userId: string, source?: SignupSource): Promise<void> {
  const db = await getDb()
  const existing = await db.collection<UserDoc>('users').findOne({ _id: userId }, { projection: { _id: 1 } })
  if (existing) return

  const user = await getWorkOSClient().userManagement.getUser(userId)
  await ensureUser(user, source, 'jit')
}

/** Idempotently records the first expense explicitly created in the manual-entry flow. */
export async function markManualTransactionComplete(userId: string): Promise<void> {
  const db = await getDb()
  await db.collection<UserDoc>('users').updateOne(
    { _id: userId, manualTransactionCompletedAt: { $in: [null, undefined] } },
    { $set: { manualTransactionCompletedAt: new Date().toISOString() } },
  )
}

/**
 * The user shape both clients consume. Lives here rather than in the /api/user
 * route because Next forbids route files exporting anything but handlers, and
 * /api/onboarding/complete returns the same object so a just-onboarded client
 * can seed its profile cache without a second request.
 */
export function serializeUser(user: UserDoc | null) {
  if (!user) return null
  const profile = { ...user }
  delete profile.welcomeEmail
  return {
    ...profile,
    currencyCode: resolveCurrency(user.currencyCode),
    name: displayName(user),
    emailVerified: user.emailVerified ?? true,
    deletionScheduledFor: user.deleted_at ? purgesAt(user.deleted_at) : null,
  }
}
