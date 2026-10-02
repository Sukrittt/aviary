import { it, expect, vi, beforeEach } from 'vitest'

const authenticateWithCode = vi.fn()
const saveSession = vi.fn()
vi.mock('@workos-inc/authkit-nextjs', () => ({ saveSession }))
vi.mock('@/lib/users', () => ({ ensureUser: vi.fn() }))
vi.mock('@/lib/email/welcome', () => ({ scheduleWelcomeEmail: vi.fn() }))
vi.mock('@/lib/access', () => ({ getAuth: vi.fn(async () => null) }))
vi.mock('@/lib/oauthState', () => ({
  verifyState: vi.fn(() => ({ isLink: false })),
  clearStateCookie: vi.fn(),
}))
vi.mock('@/lib/workosClient', () => ({ getWorkOSClient: () => ({ userManagement: { authenticateWithCode } }) }))
const { GET } = await import('./route')
const { scheduleWelcomeEmail } = await import('@/lib/email/welcome')

const callback = () => GET(new Request('https://example.com/api/auth/google/callback?code=abc&state=nonce'))

beforeEach(() => {
  authenticateWithCode.mockReset()
  saveSession.mockReset()
  vi.mocked(scheduleWelcomeEmail).mockClear()
})

it('signs in and lands on the app when Google hands back a good code', async () => {
  authenticateWithCode.mockResolvedValue({ user: { id: 'u1' }, accessToken: 'a', refreshToken: 'r' })
  const res = await callback()
  expect(res.headers.get('location')).toBe('https://example.com/')
  expect(saveSession).toHaveBeenCalled()
  expect(scheduleWelcomeEmail).toHaveBeenCalledWith('u1')
})

it('bounces back to sign-in instead of a 500 when the code exchange fails', async () => {
  authenticateWithCode.mockRejectedValue(new Error('invalid_grant'))
  const res = await callback()
  expect(res.status).toBe(307)
  expect(res.headers.get('location')).toBe('https://example.com/sign-in?authError=1')
  expect(saveSession).not.toHaveBeenCalled()
  expect(scheduleWelcomeEmail).not.toHaveBeenCalled()
})
