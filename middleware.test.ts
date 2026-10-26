import { it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse, type NextFetchEvent } from 'next/server'

const signedIn = { value: false }
vi.mock('@workos-inc/authkit-nextjs', () => ({
  authkitMiddleware: () => async () => NextResponse.next(),
  authkit: async () => ({ session: { user: signedIn.value ? { id: 'user_1' } : null }, headers: new Headers() }),
  handleAuthkitProxy: (_req: NextRequest, _h: Headers, opts?: { redirect?: string }) =>
    opts?.redirect ? NextResponse.redirect(new URL(opts.redirect, 'https://example.com')) : NextResponse.next(),
}))
vi.mock('@/lib/bearer', () => ({bearerToken: () => 'cron-secret', verifyBearerToken: vi.fn(async () => null)}))
const { default: middleware } = await import('./middleware')

beforeEach(() => { signedIn.value = false })

it.each(['/api/cron/gc', '/api/cron/future', '/api/notifications/run'])('lets the handler authenticate %s', async path => {
 expect((await middleware(new NextRequest('https://example.com'+path), {} as NextFetchEvent))?.status).toBe(200)
})
it('rejects invalid bearer on ordinary API routes', async () => {
 expect((await middleware(new NextRequest('https://example.com/api/expenses'), {} as NextFetchEvent))?.status).toBe(401)
})

it.each(['/', '/intl', '/changelog', '/help', '/privacy-policy', '/legal/privacy', '/sign-in', '/email', '/code'])('keeps %s public without a session', async path => {
 const response = await middleware(new NextRequest('https://example.com'+path), {} as NextFetchEvent)
 expect(response?.status).toBe(200)
 expect(response?.headers.get('location')).toBeNull()
})

it.each(['/expense', '/expense/transactions', '/insights', '/investments', '/wrapped', '/account', '/account/data', '/onboarding'])('sends a signed-out visitor on %s to sign in', async path => {
 const response = await middleware(new NextRequest('https://example.com'+path), {} as NextFetchEvent)
 expect(response?.headers.get('location')).toBe('https://example.com/sign-in')
})

it('lets a signed-in user through to the app', async () => {
 signedIn.value = true
 const response = await middleware(new NextRequest('https://example.com/expense'), {} as NextFetchEvent)
 expect(response?.status).toBe(200)
 expect(response?.headers.get('location')).toBeNull()
})

it.each(['/', '/intl', '/?utm_source=email'])('sends a signed-in visitor on %s to their expense page', async path => {
 signedIn.value = true
 const response = await middleware(new NextRequest('https://example.com'+path), {} as NextFetchEvent)
 expect(response?.status).toBe(307)
 expect(response?.headers.get('location')).toBe('https://example.com/expense')
})

it('keeps public legal pages accessible to signed-in visitors', async () => {
 signedIn.value = true
 const response = await middleware(new NextRequest('https://example.com/legal/privacy'), {} as NextFetchEvent)
 expect(response?.status).toBe(200)
 expect(response?.headers.get('location')).toBeNull()
})

const attr = (response: Response | null | undefined | void) => {
  const set = response instanceof NextResponse ? response.cookies.get('aviary_attr')?.value : undefined
  return set === undefined ? undefined : JSON.parse(set)
}

it('remembers a tagged landing for the signup that follows', async () => {
  const response = await middleware(new NextRequest('https://example.com/compare/ynab?utm_source=reddit&utm_campaign=r%2Fx'), {} as NextFetchEvent)
  expect(attr(response)).toEqual({ utm_source: 'reddit', utm_campaign: 'r/x', landing_path: '/compare/ynab' })
})

it('remembers an external referrer on a first untagged visit only', async () => {
  const first = await middleware(new NextRequest('https://example.com/', { headers: { referer: 'https://www.google.com/' } }), {} as NextFetchEvent)
  expect(attr(first)).toEqual({ referrer_domain: 'google.com', landing_path: '/' })
  const again = new NextRequest('https://example.com/pricing', { headers: { referer: 'https://x.com/', cookie: 'aviary_attr=%7B%22utm_source%22%3A%22reddit%22%7D' } })
  expect(attr(await middleware(again, {} as NextFetchEvent))).toBeUndefined()
})

it('leaves API calls and client-side navigations alone', async () => {
  signedIn.value = true
  expect(attr(await middleware(new NextRequest('https://example.com/api/user?utm_source=x'), {} as NextFetchEvent))).toBeUndefined()
  expect(attr(await middleware(new NextRequest('https://example.com/pricing?utm_source=x', { headers: { rsc: '1' } }), {} as NextFetchEvent))).toBeUndefined()
})

it('still tags the redirect when a signed-in visitor follows a link home', async () => {
  signedIn.value = true
  const response = await middleware(new NextRequest('https://example.com/?utm_source=email'), {} as NextFetchEvent)
  expect(response?.headers.get('location')).toBe('https://example.com/expense')
  expect(attr(response)).toMatchObject({ utm_source: 'email' })
})

const market = (response: Response | null | undefined | void) => response instanceof NextResponse ? response.cookies.get('aviary_market')?.value : undefined

it('notes the visitor’s market from the same geo header the landing page reads', async () => {
  const page = (country: string, cookie = '') => middleware(new NextRequest('https://example.com/compare/goodbudget', { headers: { 'x-vercel-ip-country': country, ...(cookie && { cookie }) } }), {} as NextFetchEvent)
  expect(market(await page('US'))).toBe('intl')
  expect(market(await page('IN'))).toBe('in')
  expect(market(await page('US', 'aviary_market=intl'))).toBeUndefined()
  expect(market(await middleware(new NextRequest('https://example.com/compare/goodbudget'), {} as NextFetchEvent))).toBeUndefined()
})
