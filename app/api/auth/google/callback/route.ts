import { NextResponse } from 'next/server'
import { saveSession } from '@workos-inc/authkit-nextjs'
import { getWorkOSClient } from '@/lib/workosClient'
import { ensureUser } from '@/lib/users'
import { readAttribution } from '@/lib/attribution'
import { scheduleWelcomeEmail } from '@/lib/email/welcome'
import { getAuth } from '@/lib/access'
import { verifyState, clearStateCookie } from '@/lib/oauthState'
import { SIGN_IN_OUTCOME_COOKIE } from '@/src/lib/analytics'
import { RETURN_COOKIE, safeReturnTo } from '@/src/lib/returnTo'

/** Readable by the page, unlike the session: AnalyticsProvider reports it, then clears it. */
function setSignInOutcome(res: NextResponse, outcome: string): void {
  res.cookies.set(SIGN_IN_OUTCOME_COOKIE, outcome, { path: '/', maxAge: 300, sameSite: 'lax' })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''
  if (!code) return NextResponse.redirect(new URL('/', req.url))

  const verified = verifyState(req, state)
  if (!verified) {
    // Missing/mismatched state means this request didn't originate from our
    // own /api/auth/google redirect — reject rather than authenticating with
    // an attacker-supplied code (login CSRF).
    const res = NextResponse.redirect(new URL('/sign-in?authError=1', req.url))
    clearStateCookie(res)
    // A link attempt from account security isn't a sign-in; keep it out of the funnel.
    if (!state.startsWith('link:')) setSignInOutcome(res, 'state_mismatch')
    return res
  }
  const { isLink } = verified

  // Read the caller's existing session before authenticating, so a link
  // attempt can be compared against it rather than blindly overwriting it.
  const before = isLink ? await getAuth(req) : null

  let authed
  try {
    authed = await getWorkOSClient().userManagement.authenticateWithCode({
      clientId: process.env.WORKOS_CLIENT_ID!,
      code,
      userAgent: req.headers.get('user-agent') ?? undefined,
    })
  } catch {
    // Expired or already-used code (back button, double-submit): send the
    // user back to sign-in with the error banner instead of a bare 500.
    const res = NextResponse.redirect(new URL('/sign-in?authError=1', req.url))
    clearStateCookie(res)
    if (!isLink) setSignInOutcome(res, 'token_exchange_failed')
    return res
  }
  const { user, accessToken, refreshToken } = authed

  if (isLink && before && !before.readOnly && user.id !== before.userId) {
    // A different Google account than the one signed in — WorkOS just created
    // (or authenticated as) a distinct user. Leave the current session alone.
    const res = NextResponse.redirect(new URL('/account/security?linkError=1', req.url))
    clearStateCookie(res)
    return res
  }

  await ensureUser(user, readAttribution(req), 'google')
  await saveSession({ accessToken, refreshToken, user }, req.url)
  scheduleWelcomeEmail(user.id)
  // A page that sent you to sign in (the join page) gets you back.
  const back = isLink ? null : safeReturnTo(/(?:^|;\s*)aviary-return=([^;]*)/.exec(req.headers.get('cookie') ?? '')?.[1])
  const res = NextResponse.redirect(new URL(isLink ? '/account/security?linked=1' : back ?? '/', req.url))
  if (back) res.cookies.set(RETURN_COOKIE, '', { path: '/', maxAge: 0 })
  clearStateCookie(res)
  if (!isLink) setSignInOutcome(res, 'completed')
  return res
}
