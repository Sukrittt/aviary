import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuth = vi.fn()
const mockReadOnlyGuard = vi.fn()
const mockRequireAccess = vi.fn()
const mockIsRateLimited = vi.fn()
const mockPick = vi.fn()
const mockFindUser = vi.fn()
const mockAiOff = vi.fn()
const mockAllowance = vi.fn()

vi.mock('@/lib/access', () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
  readOnlyGuard: (...args: unknown[]) => mockReadOnlyGuard(...args),
}))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: (...args: unknown[]) => mockRequireAccess(...args) }))
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: (...args: unknown[]) => mockIsRateLimited(...args) }))
vi.mock('@/lib/ai/jev', () => ({ pickBudgetBuckets: (...args: unknown[]) => mockPick(...args) }))
vi.mock('@/lib/systemSettings', () => ({ aiDisabledResponse: () => mockAiOff() }))
vi.mock('@/lib/ai/allowance', () => ({ aiAllowanceResponse: () => mockAllowance() }))
vi.mock('@/lib/mongodb', () => ({
  getDb: async () => ({ collection: () => ({ findOne: (...args: unknown[]) => mockFindUser(...args) }) }),
}))

const { POST } = await import('./route')

function req(body: unknown): Request {
  return new Request('https://example.com/api/onboarding/split-buckets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const body = { categories: [{ name: 'SIP', group: 'Future' }, { name: 'Rent', group: 'Essentials' }] }
const status = (s: number) => new Response('{}', { status: s })

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAuth.mockResolvedValue({ userId: 'user_a', readOnly: false, sessionId: null })
  mockReadOnlyGuard.mockReturnValue(null)
  mockRequireAccess.mockResolvedValue(null)
  mockIsRateLimited.mockResolvedValue(false)
  mockFindUser.mockResolvedValue({ _id: 'user_a', onboardedAt: null })
  mockAiOff.mockResolvedValue(null)
  mockAllowance.mockResolvedValue(null)
  mockPick.mockResolvedValue({ sip: 'savings' })
})

describe('POST /api/onboarding/split-buckets', () => {
  it('tags only the names the defaults do not cover', async () => {
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ buckets: { sip: 'savings' } })
    expect(mockPick).toHaveBeenCalledWith([{ name: 'SIP', group: 'Future' }], { userId: 'user_a', feature: 'onboarding' })
    expect(mockRequireAccess).toHaveBeenCalledWith(expect.anything(), { setup: true })
  })

  it('skips the model, the rate limit and the database when every name is a default', async () => {
    const res = await POST(req({ categories: [{ name: 'Rent', group: 'Essentials' }] }))
    expect(await res.json()).toEqual({ buckets: {} })
    expect(mockPick).not.toHaveBeenCalled()
    expect(mockIsRateLimited).not.toHaveBeenCalled()
  })

  it('refuses an account that already finished onboarding', async () => {
    mockFindUser.mockResolvedValue({ _id: 'user_a', onboardedAt: '2026-01-01T00:00:00Z' })
    expect((await POST(req(body))).status).toBe(403)
    expect(mockPick).not.toHaveBeenCalled()
  })

  it('refuses the read-only demo user', async () => {
    mockReadOnlyGuard.mockReturnValue(status(403))
    expect((await POST(req(body))).status).toBe(403)
    expect(mockPick).not.toHaveBeenCalled()
  })

  it('returns the billing gate when access is denied', async () => {
    mockRequireAccess.mockResolvedValue(status(402))
    expect((await POST(req(body))).status).toBe(402)
    expect(mockPick).not.toHaveBeenCalled()
  })

  it('respects the AI kill switch and the monthly allowance', async () => {
    mockAiOff.mockResolvedValue(status(503))
    expect((await POST(req(body))).status).toBe(503)
    mockAiOff.mockResolvedValue(null)
    mockAllowance.mockResolvedValue(status(429))
    expect((await POST(req(body))).status).toBe(429)
    expect(mockPick).not.toHaveBeenCalled()
  })

  it('returns 429 without calling the model when rate limited', async () => {
    mockIsRateLimited.mockResolvedValue(true)
    expect((await POST(req(body))).status).toBe(429)
    expect(mockPick).not.toHaveBeenCalled()
  })

  it.each([
    ['no list', {}],
    ['an empty list', { categories: [] }],
    ['too many', { categories: Array.from({ length: 31 }, (_, i) => ({ name: `c${i}`, group: 'g' })) }],
    ['a blank name', { categories: [{ name: '  ', group: 'g' }] }],
    ['a long name', { categories: [{ name: 'x'.repeat(61), group: 'g' }] }],
    ['a non-string', { categories: [{ name: 5, group: 'g' }] }],
    ['a bare string', { categories: ['SIP'] }],
  ])('rejects %s', async (_label, bad) => {
    expect((await POST(req(bad))).status).toBe(400)
    expect(mockPick).not.toHaveBeenCalled()
  })

  it('returns 502 when Jev fails', async () => {
    mockPick.mockRejectedValue(new Error('gateway down'))
    expect((await POST(req(body))).status).toBe(502)
  })
})
