import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const })),
  readOnlyGuard: vi.fn(() => null),
}))

const isRateLimitedMock = vi.fn(async () => false)
vi.mock('@/lib/rateLimit', () => ({
  isRateLimited: isRateLimitedMock,
}))

const listUsersMock = vi.fn(async () => ({ data: [] }))
const updateUserMock = vi.fn(async () => undefined)
const sendVerificationEmailMock = vi.fn(async () => undefined)
vi.mock('@/lib/workosClient', () => ({
  getWorkOSClient: vi.fn(() => ({
    userManagement: {
      listUsers: listUsersMock,
      updateUser: updateUserMock,
      sendVerificationEmail: sendVerificationEmailMock,
    },
  })),
}))

const usersUpdateOneMock = vi.fn(async () => ({ matchedCount: 1 }))
vi.mock('@/lib/mongodb', () => ({
  getDb: vi.fn(async () => ({
    collection: vi.fn(() => ({ updateOne: usersUpdateOneMock })),
  })),
}))

const { POST } = await import('./route')

function postRequest(body: unknown): Request {
  return new Request('https://example.com/api/user/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  isRateLimitedMock.mockClear()
  isRateLimitedMock.mockResolvedValue(false)
  listUsersMock.mockClear()
  updateUserMock.mockClear()
  sendVerificationEmailMock.mockClear()
  usersUpdateOneMock.mockClear()
})

describe('POST /api/user/email', () => {
  it('changes the email when under the rate limit', async () => {
    const res = await POST(postRequest({ email: 'new@example.com' }))
    expect(res.status).toBe(200)
    expect(updateUserMock).toHaveBeenCalledWith({ userId: 'user_a', email: 'new@example.com' })
    expect(sendVerificationEmailMock).toHaveBeenCalled()
  })

  it('returns 429 and skips WorkOS once the per-user limit is hit', async () => {
    isRateLimitedMock.mockResolvedValue(true)
    const res = await POST(postRequest({ email: 'new@example.com' }))
    expect(res.status).toBe(429)
    expect(listUsersMock).not.toHaveBeenCalled()
    expect(updateUserMock).not.toHaveBeenCalled()
  })
})
