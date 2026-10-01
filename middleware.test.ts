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

it.each(['/', '/privacy-policy', '/legal/privacy', '/sign-in', '/email', '/code'])('keeps %s public without a session', async path => {
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

it.each(['/', '/?utm_source=email'])('sends a signed-in visitor on %s to their expense page', async path => {
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
