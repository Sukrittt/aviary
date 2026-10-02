import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/access', () => ({ getAuth: vi.fn() }))
vi.mock('@/lib/users', () => ({ ensureUserById: vi.fn() }))
vi.mock('@/lib/email/welcome', () => ({ scheduleWelcomeEmail: vi.fn() }))
const { getAuth } = await import('@/lib/access')
const { ensureUserById } = await import('@/lib/users')
const { scheduleWelcomeEmail } = await import('@/lib/email/welcome')
const { GET } = await import('./route')
beforeEach(() => vi.clearAllMocks())

it('schedules welcome delivery after Mobile’s first authenticated user creation', async () => {
  vi.mocked(getAuth).mockResolvedValue({ userId: 'user_mobile', readOnly: false, sessionId: null })
  const response = await GET(new Request('https://example.com/api/auth/verify'))
  expect(await response.json()).toEqual({ ok: true, userId: 'user_mobile' })
  expect(ensureUserById).toHaveBeenCalledWith('user_mobile')
  expect(scheduleWelcomeEmail).toHaveBeenCalledWith('user_mobile')
})

it('does not create a user or email the read-only demo account', async () => {
  vi.mocked(getAuth).mockResolvedValue({ userId: 'demo', readOnly: true, sessionId: null })
  expect((await GET(new Request('https://example.com/api/auth/verify'))).status).toBe(401)
  expect(ensureUserById).not.toHaveBeenCalled()
  expect(scheduleWelcomeEmail).not.toHaveBeenCalled()
})
