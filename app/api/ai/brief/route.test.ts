import { describe, it, expect, vi, beforeEach } from 'vitest'

const runJev = vi.fn()
const generateJSON = vi.fn()

vi.mock('@/lib/access', () => ({ getAuth: vi.fn(async () => ({ userId: 'user_1', readOnly: false, sessionId: null })) }))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: vi.fn(async () => null) }))
vi.mock('@/lib/systemSettings', () => ({ aiDisabledResponse: vi.fn(async () => null) }))
vi.mock('@/lib/ai/allowance', () => ({ aiAllowanceResponse: vi.fn(async () => null) }))
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: vi.fn(async () => false) }))
vi.mock('@/lib/userCurrency', () => ({
  getUserCurrency: vi.fn(async () => 'INR'),
  nowForUser: vi.fn(async () => ({ date: '2026-09-23', timestamp: '2026-09-23T10:00:00+05:30' })),
}))

const cacheFindOne = vi.fn<() => Promise<Record<string, unknown> | null>>(async () => null)
const cacheUpdateOne = vi.fn(async () => ({ matchedCount: 1 }))
vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async () => ({ findOne: cacheFindOne, updateOne: cacheUpdateOne })),
  }
})
vi.mock('@/lib/ai/jev', () => ({ runJev: (...args: unknown[]) => runJev(...(args as [])) }))
vi.mock('@/lib/ai/gemini', () => ({ generateJSON: (...args: unknown[]) => generateJSON(...(args as [])) }))
vi.mock('@/lib/ai/expenseContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/expenseContext')>()
  return {
    ...actual,
    buildExpenseContext: vi.fn(async () => ({
      facts: '',
      sections: { header: 'MONTH: 2026-09', envelopes: 'ENVELOPES:', trend: '', top10: '', subscriptions: '', investments: '', transactions: 'TRANSACTIONS:' },
      highlights: {
        topItem: { item: 'Flight to Goa', amount: 7400, category: 'Travel', date: '2026-09-11' },
        riser: null,
        pace: null,
        subscriptionMonthlyBurn: 1290,
        investmentTotal: 0,
      },
      meta: { txnCountThisMonth: 24, totalSpent: 21000, totalAssigned: 30000, daysLeft: 7, daysElapsed: 23, totalDaysInMonth: 30 },
      envelopes: [
        { category: 'Food', group: 'Needs', assigned: 8000, spent: 6400, available: 1600, isOverspent: false },
        { category: 'Travel', group: 'Wants', assigned: 5000, spent: 7400, available: -2400, isOverspent: true },
      ],
      subscriptions: [],
      categories: [],
      currencyCode: 'INR',
    })),
  }
})

const { GET } = await import('./route')

const req = () => new Request('https://example.com/api/ai/brief')

beforeEach(() => {
  vi.clearAllMocks()
  cacheFindOne.mockResolvedValue(null)
  runJev.mockRejectedValue(new Error('gateway down'))
  generateJSON.mockResolvedValue({ narrative: 'You are running hot on Travel.' })
})

describe('GET /api/ai/brief', () => {
  it('returns three cards and four questions with the numbers computed in code', async () => {
    const body = await (await GET(req())).json()

    expect(body.cards).toHaveLength(3)
    expect(body.questions).toHaveLength(4)
    expect(body.meta.txnCountThisMonth).toBe(24)
    expect(body.cards.find((c: { title: string }) => c.title === 'Travel')).toMatchObject({ amount: 2400, tone: 'warn' })
    expect(body.cards.every((c: { valueLabel: string }) => c.valueLabel === 'INR')).toBe(true)
  })

  it('never puts the transaction rows in the Gemini prompt', async () => {
    await GET(req())
    expect(generateJSON.mock.calls[0][0] as string).not.toContain('TRANSACTIONS:')
  })

  it('caches the finished brief', async () => {
    await GET(req())
    const [, update] = cacheUpdateOne.mock.calls[0] as unknown as [unknown, { $set: { payload: { cards: unknown[] } } }]
    expect(update.$set.payload.cards).toHaveLength(3)
  })

  it('serves a fresh cached brief without calling either model', async () => {
    cacheFindOne.mockResolvedValue({ payload: { narrative: 'cached', cards: [], questions: [], meta: {} }, builtAt: new Date() })

    const body = await (await GET(req())).json()

    expect(body.narrative).toBe('cached')
    expect(runJev).not.toHaveBeenCalled()
    expect(generateJSON).not.toHaveBeenCalled()
  })

  it('rebuilds once the cached brief has aged out', async () => {
    cacheFindOne.mockResolvedValue({ payload: { narrative: 'stale' }, builtAt: new Date(Date.now() - 60 * 60_000) })

    const body = await (await GET(req())).json()

    expect(body.narrative).toBe('You are running hot on Travel.')
    expect(generateJSON).toHaveBeenCalled()
  })

  it('still answers when Gemini cannot write the narrative', async () => {
    generateJSON.mockRejectedValue(new Error('gemini down'))

    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.narrative).toContain('21,000')
    expect(body.cards).toHaveLength(3)
  })
})
