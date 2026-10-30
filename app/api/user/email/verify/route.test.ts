import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const })),
  readOnlyGuard: vi.fn(() => null),
}))
const isRateLimited = vi.fn(async () => false)
vi.mock('@/lib/rateLimit', () => ({ isRateLimited }))
const verifyEmail = vi.fn(async () => ({ user: { emailVerified: true } }))
vi.mock('@/lib/workosClient', () => ({ getWorkOSClient: () => ({ userManagement: { verifyEmail } }) }))
vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ collection: () => ({ updateOne: async () => ({}) }) }) }))

const { POST } = await import('./route')
const req = () => new Request('https://example.com/api/user/email/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"code":"123456"}' })

describe('POST /api/user/email/verify', () => {
  beforeEach(() => vi.clearAllMocks())

  it('checks the code when under the limit', async () => {
    expect((await POST(req())).status).toBe(200)
    expect(isRateLimited).toHaveBeenCalledWith('user-email-verify:user_a', expect.any(Array))
  })

  it("doesn't check a code once limited", async () => {
    isRateLimited.mockResolvedValueOnce(true)
    expect((await POST(req())).status).toBe(429)
    expect(verifyEmail).not.toHaveBeenCalled()
  })
})
