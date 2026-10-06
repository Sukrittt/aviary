import { getDb } from './mongodb'
import { getWorkOSClient } from './workosClient'
import { resolveCurrency } from '@/src/lib/currencies'
import { purgesAt } from './archive'
import { queueWelcomeEmail, type WelcomeDelivery } from './email/welcome'

/** Features a user can hide from Mobile's More page for a simpler app. Hiding removes entry points only; data is untouched. */
export const HIDEABLE_FEATURES = ['askAviary', 'investments', 'billScan', 'recurring', 'subscriptions', 'insights', 'wrapped'] as const
export type HideableFeature = (typeof HIDEABLE_FEATURES)[number]

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
  onboardedAt?: string | null
  /** When the first-week recap was opened, on any device. Server-set, once. */
  weekRecapSeenAt?: string | null
  /** Server-owned milestones used by Mobile's finite Home "Get started" card. */
  getStartedAt?: string | null
  manualTransactionCompletedAt?: string | null
  guidedTourCompletedAt?: string | null
  /** Web releases already announced. Server-owned, atomic across tabs/devices. */
  seenWebChangelogIds?: string[]
  notifyCadence?: 'off' | 'weekly' | 'daily'
  /** Category limit alerts (threshold + overspent) — independent of `notifyCadence`, which only gates the digest. */
  notifyThresholds?: boolean
  notifyBills?: boolean
  notifyBillLeadDays?: number
  notifyCoach?: boolean
  /** Push when a new monthly Wrapped edition unlocks — independent of `notifyCadence`. */
  notifyWrapped?: boolean
  hiddenFeatures?: HideableFeature[]
  /** Legacy fields from before the flat `name` field — read via `displayName`, never written. */
  firstName?: string | null
  lastName?: string | null
  /** Grants /admin. Set only by scripts/grant-admin.mjs — never writable from any route. */
  isAdmin?: boolean
  /** Subject to the billing switches while `billing.audience` is `testers`. Set only by scripts/grant-billing-tester.mjs. */
  billingTester?: boolean
  /** Last authenticated request, stamped at most hourly by lib/lastSeen.ts. */
  lastSeenAt?: Date
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

/** Upsert from a WorkOS user object already in hand — e.g. a fresh authenticate response. */
export async function ensureUser(user: WorkOSUserLike): Promise<void> {
  const db = await getDb()
  await db.collection<UserDoc>('users').updateOne(
    { _id: user.id },
    {
      // Email, its verified state, and avatar are authoritative in WorkOS, so
      // every sign-in refreshes them.
      $set: { email: user.email, emailVerified: user.emailVerified ?? true, avatarUrl: user.profilePictureUrl ?? null },
      // Name is authoritative in this app once set — a Google sign-in must not overwrite
      // a rename the user made here, so it's only ever seeded on first insert.
      $setOnInsert: {
        _id: user.id,
        name: user.name || [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || null,
        createdAt: new Date(),
        welcomeEmail: queueWelcomeEmail({ email: user.email, name: user.name || [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || null }),
        currencyCode: 'INR',
        // Digest is opt-out, not opt-in: a new account with notifications off
        // never hears from the app again. Seeded only on insert, so an existing
        // user who chose 'off' stays off.
        notifyCadence: 'daily',
      },
    },
    { upsert: true },
  )
}

/** Upsert by id alone — fetches the WorkOS user only when the local row doesn't exist yet. */
export async function ensureUserById(userId: string): Promise<void> {
  const db = await getDb()
  const existing = await db.collection<UserDoc>('users').findOne({ _id: userId }, { projection: { _id: 1 } })
  if (existing) return

  const user = await getWorkOSClient().userManagement.getUser(userId)
  await ensureUser(user)
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
