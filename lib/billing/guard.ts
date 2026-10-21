/**
 * Server-side access enforcement for ordinary app routes.
 *
 * UI gating is not enforcement — an expired account with a stale bundle, a
 * cached token, or curl reaches these handlers directly. This is the check
 * that actually decides.
 *
 * Deliberately *not* applied to: authentication, onboarding, billing itself,
 * account controls, support, and the complete export workflow. Those are the
 * exit routes an expired user must keep, and locking them would trap someone
 * who has already stopped paying us.
 */
import { NextResponse } from 'next/server'
import type { Auth } from '../access'
import { billingFlagsFor } from './flags'
import { getAccess } from './service'
import { getDb } from '../mongodb'

/**
 * Stable, distinct error code. Not 401 (the session is fine) and not a
 * network failure — clients branch on this to show the subscribe screen
 * rather than signing the user out or retrying forever.
 */
export const SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED'

/** The request named a budget the user isn't (or is no longer) a member of. */
export const NOT_A_MEMBER = 'NOT_A_MEMBER'

/**
 * A member's write to a shared budget whose owner's plan has lapsed. The
 * budget stays readable (and exportable) for everyone; only the owner can
 * reopen it, so members get a banner, not the subscribe screen.
 */
export const BUDGET_READ_ONLY = 'BUDGET_READ_ONLY'

/**
 * A write from an account in its deletion grace window. Reads stay open:
 * the mobile app signs out on any 401/403 query, which would leave no way to
 * reach Restore (an account route, never guarded here).
 */
export const ACCOUNT_DELETED = 'ACCOUNT_DELETED'

/**
 * 402 when the account may not use normal app features, else null. Call at
 * the top of a handler, after `getAuth`.
 *
 * The demo user is exempt: it is public sample data with no owner to bill.
 *
 * `setup` marks the handlers onboarding writes through. They also admit an
 * account with no trial yet, since the trial only begins at completion and
 * completion needs those setup rows. Every other route stays closed until then.
 */
export async function requireAccess(auth: Auth, opts: { setup?: boolean } = {}): Promise<NextResponse | null> {
  if (auth.readOnly) return null
  if (auth.spaceDenied) return NextResponse.json({ error: NOT_A_MEMBER, spaceId: auth.spaceId }, { status: 403 })
  // `method` is unset only for jobs, which never come from a deleted account's session.
  const write = !!auth.method && auth.method !== 'GET' && auth.method !== 'HEAD'
  if (write && (await (await getDb()).collection<{ _id: string }>('users').findOne({ _id: auth.userId, deleted_at: { $ne: null } }, { projection: { _id: 1 } }))) {
    return NextResponse.json({ error: ACCOUNT_DELETED }, { status: 401 })
  }

  // The budget's owner pays for everyone in it, so it's their plan that decides.
  const payer = auth.spaceOwnerId

  // Checked first so the guard costs nothing while enforcement is off: this
  // sits on 51 handlers, and settings are cached in-process for 30s, so the
  // flag being off means no extra database round trip per request rather than
  // one on every call in the app. Scoped per user (testers-only audience).
  if (!(await billingFlagsFor(payer)).enforced) return null

  const access = await getAccess(payer)
  if (access.allowed || (opts.setup && access.mode === 'setup_incomplete')) return null
  if (payer !== auth.userId) {
    if (auth.method === 'GET' || auth.method === 'HEAD') return null
    return NextResponse.json({ error: BUDGET_READ_ONLY, mode: access.mode }, { status: 402 })
  }
  return NextResponse.json(
    { error: SUBSCRIPTION_REQUIRED, mode: access.mode, trialEndsAt: access.trialEndsAt },
    { status: 402 },
  )
}

/**
 * The gate for acting on budgets themselves (making one, renaming one):
 * checked against the caller's own plan, since a new budget is billed to its
 * creator, whichever budget they happen to be in.
 */
export function requireOwnPlan(auth: Auth, opts: { setup?: boolean } = {}): Promise<NextResponse | null> {
  return requireAccess({ ...auth, spaceOwnerId: auth.userId, spaceDenied: undefined }, opts)
}

/** Whether a budget owned by `ownerId` is read-only for its members right now: the owner's plan has lapsed. */
export async function ownerLapsed(ownerId: string): Promise<boolean> {
  if (!(await billingFlagsFor(ownerId)).enforced) return false
  return !(await getAccess(ownerId)).allowed
}
