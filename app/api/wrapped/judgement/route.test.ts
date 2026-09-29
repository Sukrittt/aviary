import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/access', () => ({ getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null })) }))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: vi.fn(async () => null) }))
vi.mock('@/lib/userCurrency', () => ({ nowForUser: vi.fn(async () => ({ date: '2026-09-24' })) }))
vi.mock('@/lib/wrapped', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/wrapped')>()),
  readRecap: vi.fn(async () => ({ totalTransactions: 20 })),
}))

type CacheArgs = [base: string, userId: string, fn: () => Promise<unknown>, keySuffix?: string]
const cachedRead = vi.fn((...args: CacheArgs) => args[2]())
vi.mock('@/lib/cache', () => ({ cachedRead: (...args: unknown[]) => cachedRead(...(args as CacheArgs)) }))

const judgeWrapped = vi.fn()
vi.mock('@/lib/ai/wrappedPersona', () => ({ judgeWrapped: (...args: unknown[]) => judgeWrapped(...(args as [])) }))

const aiAllowanceResponse = vi.fn(async (): Promise<Response | null> => null)
vi.mock('@/lib/ai/allowance', () => ({ aiAllowanceResponse: () => aiAllowanceResponse() }))

const isRateLimited = vi.fn<(key: string, opts: unknown) => Promise<boolean>>(async () => false)
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: (key: string, opts: unknown) => isRateLimited(key, opts) }))

const { GET } = await import('./route')
const request = (query = '') => new Request(`https://example.com/api/wrapped/judgement${query}`)

beforeEach(() => {
  vi.clearAllMocks()
  aiAllowanceResponse.mockResolvedValue(null)
  isRateLimited.mockResolvedValue(false)
})

describe('GET /api/wrapped/judgement', () => {
  it('caches under its own base, so an expense write does not re-run Jev', async () => {
    judgeWrapped.mockResolvedValue({ persona: 'loyalist', treatCategory: 'Food' })
    const res = await GET(request())
    expect(await res.json()).toEqual({ persona: 'loyalist', treatCategory: 'Food' })
    // Not 'wrapped': invalidate('wrapped', ...) runs on every expense write.
    expect(cachedRead.mock.calls[0][0]).toBe('wrapped-judgement')
    expect(cachedRead.mock.calls[0][3]).toBe('2026-08')
  })

  it('does not cache an empty judgement, so an outage is retried next visit', async () => {
    judgeWrapped.mockResolvedValue({ persona: null, treatCategory: null })
    const res = await GET(request())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ persona: null, treatCategory: null })
    await expect(cachedRead.mock.results[0].value).rejects.toThrow()
  })

  it.each(['2026', '2026-9', '2026-13', '2026-09-01', 'x'])('rejects month %j before any Jev call', async (month) => {
    const res = await GET(request(`?month=${encodeURIComponent(month)}`))
    expect(res.status).toBe(400)
    expect(cachedRead).not.toHaveBeenCalled()
    expect(judgeWrapped).not.toHaveBeenCalled()
  })

  it('skips Jev once the monthly AI allowance is spent', async () => {
    aiAllowanceResponse.mockResolvedValue(new Response(null, { status: 429 }))
    const res = await GET(request('?month=2026-08'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ persona: null, treatCategory: null })
    expect(judgeWrapped).not.toHaveBeenCalled()
  })

  it('skips Jev when rate limited, keyed by the user', async () => {
    isRateLimited.mockResolvedValue(true)
    const res = await GET(request('?month=2026-08'))
    expect(await res.json()).toEqual({ persona: null, treatCategory: null })
    expect(judgeWrapped).not.toHaveBeenCalled()
    expect(isRateLimited.mock.calls[0][0]).toBe('wrapped-judgement:user_a')
  })
})
