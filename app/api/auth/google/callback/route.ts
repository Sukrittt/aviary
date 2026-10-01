import { NextResponse } from 'next/server'
import { saveSession } from '@workos-inc/authkit-nextjs'
import { getWorkOSClient } from '@/lib/workosClient'
import { ensureUser } from '@/lib/users'
import { scheduleWelcomeEmail } from '@/lib/email/welcome'
import { getAuth } from '@/lib/access'
import { verifyState, clearStateCookie } from '@/lib/oauthState'

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

  await ensureUser(user)
  await saveSession({ accessToken, refreshToken, user }, req.url)
  scheduleWelcomeEmail(user.id)
  const res = NextResponse.redirect(new URL(isLink ? '/account/security?linked=1' : '/', req.url))
  clearStateCookie(res)
  return res
}
