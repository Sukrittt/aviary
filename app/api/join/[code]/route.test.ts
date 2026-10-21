import { beforeEach, describe, expect, it, vi } from 'vitest'

const isRateLimited = vi.fn(async (_key: string, _opts: unknown) => false)
vi.mock('@/lib/rateLimit', () => ({ isRateLimited, clientIp: () => '1.2.3.4' }))
const invitePreview = vi.fn(async () => ({ status: 'ok' }))
const joinBudget = vi.fn(async () => ({ spaceId: 'home', already: false }))
vi.mock('@/lib/spaceMembers', () => ({ invitePreview, joinBudget }))
vi.mock('@/lib/access', () => ({
  getAuth: async () => ({ userId: 'user_b', readOnly: false }),
  readOnlyGuard: () => null,
}))
const { GET, POST } = await import('./route')

const params = { params: Promise.resolve({ code: 'ABC234' }) }
const req = (method: string) => new Request('https://useaviary.com/api/join/ABC234', { method })

beforeEach(() => { vi.clearAllMocks(); isRateLimited.mockResolvedValue(false) })

describe('/api/join/:code rate limits (#214)', () => {
  it('GET is limited by IP and returns 429 without looking the code up', async () => {
    isRateLimited.mockResolvedValue(true)
    const res = await GET(req('GET'), params)
    expect(res.status).toBe(429)
    expect(isRateLimited.mock.calls[0][0]).toBe('join-preview:ip:1.2.3.4')
    expect(invitePreview).not.toHaveBeenCalled()
  })

  it('POST is limited by user and IP and returns 429 without joining', async () => {
    isRateLimited.mockImplementation(async (key: string) => key === 'join:ip:1.2.3.4')
    const res = await POST(req('POST'), params)
    expect(res.status).toBe(429)
    expect(isRateLimited.mock.calls.map((c) => c[0]).sort()).toEqual(['join:ip:1.2.3.4', 'join:user:user_b'])
    expect(joinBudget).not.toHaveBeenCalled()
  })

  it('under the limit, both go through', async () => {
    expect((await GET(req('GET'), params)).status).toBe(200)
    expect((await POST(req('POST'), params)).status).toBe(200)
    expect(joinBudget).toHaveBeenCalledWith('user_b', 'ABC234')
  })
})
