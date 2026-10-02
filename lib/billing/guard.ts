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

/**
 * Stable, distinct error code. Not 401 (the session is fine) and not a
 * network failure — clients branch on this to show the subscribe screen
 * rather than signing the user out or retrying forever.
 */
export const SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED'

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

  // Checked first so the guard costs nothing while enforcement is off: this
  // sits on 51 handlers, and settings are cached in-process for 30s, so the
  // flag being off means no extra database round trip per request rather than
  // one on every call in the app. Scoped per user (testers-only audience).
  if (!(await billingFlagsFor(auth.userId)).enforced) return null

  const access = await getAccess(auth.userId)
  if (access.allowed || (opts.setup && access.mode === 'setup_incomplete')) return null
  return NextResponse.json(
    { error: SUBSCRIPTION_REQUIRED, mode: access.mode, trialEndsAt: access.trialEndsAt },
    { status: 402 },
  )
}
