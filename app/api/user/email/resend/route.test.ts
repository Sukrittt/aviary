import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const })),
  readOnlyGuard: vi.fn(() => null),
}))

const isRateLimitedMock = vi.fn(async () => false)
vi.mock('@/lib/rateLimit', () => ({
  isRateLimited: isRateLimitedMock,
}))

const sendVerificationEmailMock = vi.fn(async () => undefined)
vi.mock('@/lib/workosClient', () => ({
  getWorkOSClient: vi.fn(() => ({ userManagement: { sendVerificationEmail: sendVerificationEmailMock } })),
}))

const { POST } = await import('./route')

function postRequest(): Request {
  return new Request('https://example.com/api/user/email/resend', { method: 'POST' })
}

beforeEach(() => {
  isRateLimitedMock.mockClear()
  isRateLimitedMock.mockResolvedValue(false)
  sendVerificationEmailMock.mockClear()
})

describe('POST /api/user/email/resend', () => {
  it('sends the verification email when under the rate limit', async () => {
    const res = await POST(postRequest())
    expect(res.status).toBe(200)
    expect(sendVerificationEmailMock).toHaveBeenCalledWith({ userId: 'user_a' })
  })

  it('returns 429 and skips WorkOS once the per-user limit is hit', async () => {
    isRateLimitedMock.mockResolvedValue(true)
    const res = await POST(postRequest())
    expect(res.status).toBe(429)
    expect(sendVerificationEmailMock).not.toHaveBeenCalled()
  })
})
