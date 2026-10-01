import { it, expect, vi, beforeEach, afterEach } from 'vitest'
vi.mock('@workos-inc/authkit-nextjs', () => ({saveSession: vi.fn()}))
vi.mock('@/lib/users', () => ({ensureUser: vi.fn()}))
vi.mock('@/lib/email/welcome', () => ({scheduleWelcomeEmail: vi.fn()}))
vi.mock('@/lib/rateLimit', () => ({isRateLimited: async () => false, clientIp: () => 'test'}))
const authenticateWithMagicAuth = vi.fn(async () => ({user: {id:'user_test'},accessToken:'access',refreshToken:'refresh'}))
const createMagicAuth = vi.fn(async () => ({code: 'minted'}))
vi.mock('@/lib/workosClient', () => ({getWorkOSClient: () => ({userManagement: {authenticateWithMagicAuth, createMagicAuth}})}))
const {POST} = await import('./route')
const {scheduleWelcomeEmail} = await import('@/lib/email/welcome')
const verify = (body: object) => POST(new Request('https://example.com/api/auth/magic-auth/verify',{method:'POST',body:JSON.stringify(body)}))

beforeEach(() => { authenticateWithMagicAuth.mockClear(); createMagicAuth.mockClear(); vi.mocked(scheduleWelcomeEmail).mockClear() })
afterEach(() => vi.unstubAllEnvs())

it.each([undefined, 'iPhone'])('only echoes tokens to a labeled mobile device (%s)', async device => {
 const response = await verify({email:'a@example.com',code:'123456',device})
 expect(await response.json()).toEqual(device ? {ok:true,accessToken:'access',refreshToken:'refresh'} : {ok:true})
 expect(scheduleWelcomeEmail).toHaveBeenCalledWith('user_test')
})

it('lets the review email sign in with the fixed review code', async () => {
 vi.stubEnv('REVIEW_LOGIN_EMAIL', 'Review@Example.com')
 vi.stubEnv('REVIEW_LOGIN_CODE', '424242')
 const response = await verify({email:'review@example.com',code:'424242'})
 expect(response.status).toBe(200)
 expect(createMagicAuth).toHaveBeenCalledWith({email:'review@example.com'})
 expect(authenticateWithMagicAuth).toHaveBeenCalledWith(expect.objectContaining({email:'review@example.com',code:'minted'}))
})

it.each([
 ['other email', {email:'a@example.com',code:'424242'}, {}],
 ['wrong code', {email:'review@example.com',code:'000000'}, {}],
 ['email unset', {email:'review@example.com',code:'424242'}, {REVIEW_LOGIN_EMAIL:''}],
 ['code unset', {email:'review@example.com',code:'424242'}, {REVIEW_LOGIN_CODE:''}],
])('falls back to normal codes: %s', async (_, body, env) => {
 vi.stubEnv('REVIEW_LOGIN_EMAIL', 'review@example.com')
 vi.stubEnv('REVIEW_LOGIN_CODE', '424242')
 for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string)
 await verify(body)
 expect(createMagicAuth).not.toHaveBeenCalled()
 expect(authenticateWithMagicAuth).toHaveBeenCalledWith(expect.objectContaining({code:body.code}))
})
