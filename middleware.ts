import { authkit, authkitMiddleware, handleAuthkitProxy } from '@workos-inc/authkit-nextjs'
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { bearerToken, verifyBearerToken } from '@/lib/bearer'
import { isIntlCountry, MARKET_COOKIE } from '@/lib/market'
import { ATTRIBUTION_COOKIE, ATTRIBUTION_MAX_AGE, attributionFromRequest, nextAttribution, parseAttribution, type Attribution } from '@/lib/attribution'

const refreshSession = authkitMiddleware()

// Vercel cron targets (mirrors `crons` in vercel.json). These carry
// `Authorization: Bearer ${CRON_SECRET}` — a shared secret, not a WorkOS JWT —
// so the Bearer gate below must not try to verify it. Each handler does its own
// constant-time secret check before doing anything.
const CRON_PATHS = ['/api/notifications/run']

// Provider webhooks. These carry the provider's configured shared secret as
// `Authorization` — not a WorkOS JWT — so the Bearer gate below would 401
// every delivery. Each handler does its own constant-time secret check.
const WEBHOOK_PREFIX = '/api/billing/webhooks/'

// The signed-in app. There is no guest mode: a signed-out visitor here goes to
// /sign-in. Landing, legal and the sign-in flow itself stay public.
const APP_PATHS = ['/expense', '/insights', '/investments', '/wrapped', '/account', '/onboarding']

function isAppPath(pathname: string): boolean {
  return APP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Refreshes the sealed AuthKit session cookie, and sends signed-out visitors on
 * app routes (APP_PATHS) to this app's own /sign-in page. Signed-in visitors
 * on the public home pages (/ and /intl) go straight to /expense.
 *
 * This app never uses WorkOS's hosted AuthKit UI — Google goes straight to
 * Google's consent screen and email uses magic-auth codes, both via
 * `app/api/auth/*`, both calling `saveSession()` directly (see lib/access.ts's
 * header comment). That means the library's built-in `middlewareAuth` option
 * doesn't fit here: enabling it redirects signed-out visitors to WorkOS's
 * hosted authorize URL, not to this app's own `/sign-in` page, and this app
 * has no route handler at the redirect URI it would need. Authentication is
 * therefore initiated explicitly from the app's own sign-in page.
 *
 * Every API route
 * resolves its own auth via `lib/access.ts::getAuth`, which falls back to
 * the read-only demo user (`DEMO_USER_ID`) for anyone with *no* credential
 * at all. That stays as-is — it's the fallback for API callers that bypass
 * the browser (tests, curl, direct requests). Pages no longer render that demo:
 * app routes redirect to /sign-in above.
 *
 * One exception: a request that *does* carry a Bearer token (the mobile
 * app's normal case — it always sends one once signed in) but whose token
 * fails WorkOS verification is 401'd right here, before it ever reaches a
 * route handler. That case is a broken real session (expired refresh,
 * revoked elsewhere, clock skew), not a guest — letting it fall through to
 * `getAuth`'s demo fallback would silently render the demo account's data
 * under a real, still-appears-signed-in user with no error anywhere. The
 * mobile client already has 401-triggered logout wired up
 * (`app/_layout.tsx`'s query-cache listener); this is what feeds it. The cron
 * paths are exempt from that gate — see `CRON_PATHS` above.
 */
export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  return remember(request, await route(request, event))
}

/**
 * Notes where a visitor came from in `aviary_attr` on page loads, so the
 * account they create later (after a WorkOS round trip, or on Android via the
 * Play link) knows its source. See lib/attribution.ts. Also notes the
 * visitor's market (India or not) in `aviary_market` for static footers.
 */
function remember(request: NextRequest, response: Response | null | undefined | void): Response | null | undefined | void {
  const { pathname } = request.nextUrl
  if (!(response instanceof NextResponse)) return response
  // Page loads only: not API calls, and not the client router's RSC fetches.
  if (request.method !== 'GET' || pathname.startsWith('/api/') || request.headers.has('rsc')) return response
  const raw = request.cookies.get(ATTRIBUTION_COOKIE)?.value
  const current: Attribution | null = raw ? parseAttribution(raw) : null
  const next = nextAttribution(current, attributionFromRequest(request.nextUrl, request.headers.get('referer')))
  if (next) response.cookies.set(ATTRIBUTION_COOKIE, JSON.stringify(next), { path: '/', maxAge: ATTRIBUTION_MAX_AGE, sameSite: 'lax' })
  // The landing page's India-or-not answer, for static pages' footers (lib/market.ts). Readable by the page, so not httpOnly.
  const country = request.headers.get('x-vercel-ip-country')
  const market = country ? (isIntlCountry(country) ? 'intl' : 'in') : null
  if (market && request.cookies.get(MARKET_COOKIE)?.value !== market) response.cookies.set(MARKET_COOKIE, market, { path: '/', maxAge: 30 * 24 * 60 * 60, sameSite: 'lax' })
  return response
}

async function route(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl

  // authkit() is the same session refresh authkitMiddleware runs, but hands back
  // the session so we can redirect. Only one of the two runs per request: a
  // second refresh would spend the same refresh token twice.
  const home = pathname === '/' || pathname === '/intl'
  if (home || isAppPath(pathname)) {
    const { session, headers } = await authkit(request)
    if (home) {
      return handleAuthkitProxy(request, headers, session.user ? { redirect: '/expense' } : undefined)
    }
    return handleAuthkitProxy(request, headers, session.user ? undefined : { redirect: '/sign-in' })
  }

  const response = await refreshSession(request, event)
  if (pathname.startsWith('/api/')) {
    const exempt = pathname.startsWith('/api/cron/') || pathname.startsWith(WEBHOOK_PREFIX) || CRON_PATHS.includes(pathname)
    const token = exempt ? null : bearerToken(request)
    if (token && !(await verifyBearerToken(token))) {
      return NextResponse.json({ error: 'invalid or expired session' }, { status: 401 })
    }
    return response
  }

  return response
}

export const config = {
  // Everything except static assets, so /api/* route handlers see a fresh session.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)'],
}
