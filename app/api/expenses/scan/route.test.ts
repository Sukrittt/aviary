import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuth = vi.fn()
const mockReadOnlyGuard = vi.fn()
const mockIsRateLimited = vi.fn()
const mockGenerateJSONFromImage = vi.fn()

vi.mock('@/lib/access', () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
  readOnlyGuard: (...args: unknown[]) => mockReadOnlyGuard(...args),
}))

vi.mock('@/lib/rateLimit', () => ({
  isRateLimited: (...args: unknown[]) => mockIsRateLimited(...args),
}))

vi.mock('@/lib/ai/gemini', () => ({
  generateJSONFromImage: (...args: unknown[]) => mockGenerateJSONFromImage(...args),
}))

const { POST } = await import('./route')

function req(body: unknown): Request {
  return new Request('https://example.com/api/expenses/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  image: 'aGVsbG8=',
  mimeType: 'image/png',
  categories: ['Groceries', 'Food', 'Household'],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAuth.mockResolvedValue({ userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const })
  mockReadOnlyGuard.mockReturnValue(null)
  mockIsRateLimited.mockResolvedValue(false)
  mockGenerateJSONFromImage.mockResolvedValue({
    merchant: 'Blinkit',
    total: 460,
    category: 'Groceries',
    items: [{ name: 'Milk', price: 60, qty: 1 }],
  })
})

describe('POST /api/expenses/scan', () => {
  it('returns 403 for the read-only demo user', async () => {
    mockReadOnlyGuard.mockReturnValue(new Response(JSON.stringify({ error: 'read-only' }), { status: 403 }))
    const res = await POST(req(validBody))
    expect(res.status).toBe(403)
    expect(mockGenerateJSONFromImage).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limited', async () => {
    mockIsRateLimited.mockResolvedValue(true)
    const res = await POST(req(validBody))
    expect(res.status).toBe(429)
    expect(mockGenerateJSONFromImage).not.toHaveBeenCalled()
  })

  it('rejects a disallowed mimeType', async () => {
    const res = await POST(req({ ...validBody, mimeType: 'application/pdf' }))
    expect(res.status).toBe(400)
    expect(mockGenerateJSONFromImage).not.toHaveBeenCalled()
  })

  it('rejects an oversized image payload', async () => {
    const res = await POST(req({ ...validBody, image: 'a'.repeat(6_000_001) }))
    expect(res.status).toBe(400)
    expect(mockGenerateJSONFromImage).not.toHaveBeenCalled()
  })

  it('rejects a missing/empty categories list', async () => {
    const res = await POST(req({ ...validBody, categories: [] }))
    expect(res.status).toBe(400)
    expect(mockGenerateJSONFromImage).not.toHaveBeenCalled()
  })

  it('passes the category list through to Gemini as the enum constraint and returns the parsed object', async () => {
    const res = await POST(req(validBody))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      merchant: 'Blinkit',
      total: 460,
      category: 'Groceries',
      items: [{ name: 'Milk', price: 60, qty: 1 }],
    })

    const [, , schema] = mockGenerateJSONFromImage.mock.calls[0]
    expect(schema.properties.category.enum).toEqual(validBody.categories)
  })

  it('returns 502 when the Gemini call fails', async () => {
    mockGenerateJSONFromImage.mockRejectedValue(new Error('boom'))
    const res = await POST(req(validBody))
    expect(res.status).toBe(502)
  })
})
