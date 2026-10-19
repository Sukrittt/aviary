import { NextResponse } from 'next/server'
import { withAuth } from '@workos-inc/authkit-nextjs'
import { touchLastSeen } from './lastSeen'
import { bearerToken, verifyBearerToken } from './bearer'
import { BUDGET_COOKIE, lookupMembership, requestedSpaceId, resolveSpaceAccess, type SpaceRole } from './spaces'

export { bearerToken, verifyBearerToken }

/**
 * Who a request belongs to. `userId` is the WorkOS user id (`user_…`) taken
 * from a verified access token, or `DEMO_USER_ID` for anyone signed out.
 * `readOnly` marks the demo user, whose data is public sample data.
 */
export interface Auth {
  userId: string
  readOnly: boolean
  /** The WorkOS session id (`sid`), when resolved from a real session. Null for the demo user. */
  sessionId: string | null
  /**
   * The budget this request reads and writes (lib/spaces.ts). Equal to
   * `userId` for the personal budget, which is what every request without an
   * `x-aviary-budget` header gets, so old app versions are unchanged.
   */
  spaceId: string
  /** Who pays for `spaceId`. Billing is checked against them, not the requester. */
  spaceOwnerId: string
  spaceRole: SpaceRole
  /** Set when the request named a budget the user isn't a member of. requireAccess 403s it. */
  spaceDenied?: true
}

/** Adds the budget the request names to a resolved identity. */
async function withSpace(req: Request, base: Pick<Auth, 'userId' | 'readOnly' | 'sessionId'>, cookieFallback = false): Promise<Auth> {
  const requested = requestedSpaceId(req) ?? (cookieFallback ? await pageBudgetCookie() : null)
  const access = await resolveSpaceAccess(base.userId, base.readOnly ? null : requested, lookupMembership)
  if (access.denied) return { ...base, spaceId: access.spaceId, spaceOwnerId: base.userId, spaceRole: 'member', spaceDenied: true }
  return { ...base, spaceId: access.spaceId, spaceOwnerId: access.ownerId, spaceRole: access.role }
}

/**
 * The budget cookie of the page request itself. A server component's prefetch
 * builds a bare `Request` with no cookie header, so without this it would
 * read the personal budget while the page shows another.
 */
async function pageBudgetCookie(): Promise<string | null> {
  try {
    const { cookies } = await import('next/headers')
    return (await cookies()).get(BUDGET_COOKIE)?.value || null
  } catch {
    return null
  }
}

/**
 * The user id every unauthenticated request is served as. In production this
 * must be explicitly set — silently defaulting to the literal 'demo' would
 * make the fallback tenant a guessable, world-readable bucket rather than a
 * loud, obvious deployment mistake. Local dev (and any other NODE_ENV) keeps
 * the 'demo' default, since that's the documented, expected value there.
 */
export function demoUserId(): string {
  const id = process.env.DEMO_USER_ID
  if (id) return id
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DEMO_USER_ID is not set — required in production. See .env.example.')
  }
  return 'demo'
}

/**
 * Resolve the owner of a request.
 *
 * 1. `Authorization: Bearer <jwt>` — the mobile app, which holds a WorkOS
 *    access token directly.
 * 2. The AuthKit session cookie — the web app, same-origin, so the token
 *    itself never reaches browser JavaScript.
 * 3. Neither — the demo user, read-only.
 *
 * A *missing* credential falls through to demo (anonymous browsing). A
 * Bearer token that's present but fails verification does NOT reach this
 * function in practice — `middleware.ts` 401s it first, since that case is a
 * broken real session, not a guest. This still checks it too (defence in
 * depth for any caller that bypasses middleware), falling through to demo
 * rather than throwing, matching the pre-WorkOS behaviour where data routes
 * always answered 200.
 */
export async function getAuth(req: Request): Promise<Auth> {
  const token = bearerToken(req)
  if (token) {
    const resolved = await verifyBearerToken(token)
    if (resolved) {
      await touchLastSeen(resolved.userId)
      return withSpace(req, { userId: resolved.userId, readOnly: false, sessionId: resolved.sessionId })
    }
  }

  let session: { userId: string; sessionId: string | null } | null = null
  try {
    const { user, sessionId } = await withAuth()
    if (user) {
      await touchLastSeen(user.id)
      session = { userId: user.id, sessionId: sessionId ?? null }
    }
  } catch {
    // No session cookie, or called outside a request scope — fall through.
  }
  // Outside the try: a failed membership lookup must surface, not quietly
  // turn a signed-in person into the demo user.
  if (session) return withSpace(req, { ...session, readOnly: false }, true)

  const demo = demoUserId()
  return { userId: demo, readOnly: true, sessionId: null, spaceId: demo, spaceOwnerId: demo, spaceRole: 'owner' }
}

/** 403 response used for any write attempt by the read-only demo user. */
export function readOnlyResponse(): NextResponse {
  return NextResponse.json({ error: 'read-only in demo mode' }, { status: 403 })
}

/**
 * Return a 403 response when the read-only demo user tries a non-GET, else
 * null. Demo can read the sample account but never write to it.
 */
export function readOnlyGuard(auth: Auth, method: string): NextResponse | null {
  if (auth.readOnly && method !== 'GET') return readOnlyResponse()
  return spaceGuard(auth)
}

/**
 * 403 when the request named a budget this person isn't in, for the exit
 * routes requireAccess doesn't guard (export, privacy proof). Without it they
 * still couldn't reach the budget (getCollection throws), but would 500.
 */
export function spaceGuard(auth: Auth): NextResponse | null {
  if (auth.spaceDenied) return NextResponse.json({ error: 'NOT_A_MEMBER', spaceId: auth.spaceId }, { status: 403 })
  return null
}
