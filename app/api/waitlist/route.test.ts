import { describe, it, expect, vi, beforeEach } from 'vitest'

const isRateLimitedMock = vi.fn(async () => false)
vi.mock('@/lib/rateLimit', () => ({
  isRateLimited: isRateLimitedMock,
  clientIp: () => '1.2.3.4',
}))

const findOneMock = vi.fn(async (): Promise<unknown> => null)
const insertOneMock = vi.fn(async () => ({ acknowledged: true }))
vi.mock('@/lib/mongodb', () => ({
  getDb: vi.fn(async () => ({ collection: vi.fn(() => ({ findOne: findOneMock, insertOne: insertOneMock })) })),
}))

const { POST } = await import('./route')

function postRequest(body: unknown): Request {
  return new Request('https://example.com/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  isRateLimitedMock.mockClear()
  isRateLimitedMock.mockResolvedValue(false)
  findOneMock.mockReset()
  findOneMock.mockResolvedValue(null)
  insertOneMock.mockReset()
  insertOneMock.mockResolvedValue({ acknowledged: true })
})

describe('POST /api/waitlist', () => {
  it('inserts a normalized email for the platform', async () => {
    const res = await POST(postRequest({ email: '  Me@Example.com ', platform: 'ios' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, email: 'me@example.com' })
    expect(insertOneMock).toHaveBeenCalledWith(expect.objectContaining({ email: 'me@example.com', platform: 'ios' }))
  })

  it('returns the email without inserting when it is already on the list', async () => {
    findOneMock.mockResolvedValue({ _id: 'existing' })
    const res = await POST(postRequest({ email: 'me@example.com', platform: 'ios' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, email: 'me@example.com' })
    expect(insertOneMock).not.toHaveBeenCalled()
  })

  it('treats losing a concurrent-signup race as already on the list', async () => {
    insertOneMock.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }))
    const res = await POST(postRequest({ email: 'me@example.com', platform: 'ios' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, email: 'me@example.com' })
  })

  it('rejects an invalid email or unknown platform without writing', async () => {
    expect((await POST(postRequest({ email: 'nope', platform: 'ios' }))).status).toBe(400)
    expect((await POST(postRequest({ email: 'me@example.com', platform: 'blackberry' }))).status).toBe(400)
    expect(insertOneMock).not.toHaveBeenCalled()
  })

  it('returns 429 and skips the write when rate limited', async () => {
    isRateLimitedMock.mockResolvedValue(true)
    const res = await POST(postRequest({ email: 'me@example.com', platform: 'ios' }))
    expect(res.status).toBe(429)
    expect(insertOneMock).not.toHaveBeenCalled()
  })
})
