import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/access', () => ({ getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null })) }))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: vi.fn(async () => null) }))

let user: Record<string, unknown> | null = null
vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn(async () => ({ collection: () => ({ findOne: async () => user }) })) }))

const expenses = [
  { date: '2026-10-01', timestamp: '2026-10-01T09:00:00+05:30', item: 'Chai', category: 'Food', amount_inr: '20', source: 'manual' },
  { date: '2026-10-03', timestamp: '2026-10-03T21:00:00+05:30', item: 'Chai', category: 'Food', amount_inr: '20', source: 'manual' },
]
let today = '2026-10-03'
vi.mock('@/lib/http', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...real,
    nowIn: (tz?: string, at?: Date) => (at ? real.nowIn(tz, at) : { date: today, timestamp: `${today}T12:00:00+05:30` }),
    getCollection: async () => ({ find: () => ({ toArray: async () => expenses }) }),
  }
})

const { GET } = await import('./route')
const get = async () => (await GET(new Request('https://example.com/api/recap'))).json()

beforeEach(() => {
  // Onboarded 1 Oct, IST.
  user = { _id: 'user_a', onboardedAt: '2026-10-01T06:00:00.000Z' }
})

describe('GET /api/recap', () => {
  it('reports the week so far while the app is still learning', async () => {
    today = '2026-10-03'
    expect(await get()).toEqual({ due: false, learning: { day: 3, loggedDates: ['2026-10-01', '2026-10-03'], unlocksOn: '2026-10-08' } })
  })

  it('returns the recap once it is due', async () => {
    today = '2026-10-08'
    const body = await get()
    expect(body.due).toBe(true)
    expect(body.recap.totalTransactions).toBe(2)
    expect(body.learning).toBeUndefined()
  })

  it('reports nothing once seen or after the window', async () => {
    today = '2026-10-03'
    user = { ...user, weekRecapSeenAt: '2026-10-02T00:00:00.000Z' }
    expect(await get()).toEqual({ due: false })
    user = { _id: 'user_a', onboardedAt: '2026-10-01T06:00:00.000Z' }
    today = '2026-10-20'
    expect(await get()).toEqual({ due: false })
  })

  it('reports nothing before onboarding', async () => {
    user = { _id: 'user_a' }
    expect(await get()).toEqual({ due: false })
  })
})
