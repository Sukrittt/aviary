import { describe, it, expect, vi, beforeEach } from 'vitest'

const USER: { _id: string; notifyCadence: string } = { _id: 'user_a', notifyCadence: 'weekly' }

const usersFindMock = vi.fn(() => ({ toArray: async () => [USER] }))
const logInsertOneMock = vi.fn(async () => ({ insertedId: 'x' }))
// Envelope in buildExpenseContextMock below is fixed at level 90 — resolving the same
// level here simulates "already recorded this cross", so threshold notifications are a
// no-op by default and don't interfere with the digest/coach assertions these tests care
// about. Override per-test to exercise an actual level rise.
const thresholdFindOneAndUpdateMock = vi.fn(async () => ({ level: 90 }))

function fakeCursor(docs: unknown[]): { map: (fn: (d: unknown) => unknown) => ReturnType<typeof fakeCursor>; toArray: () => Promise<unknown[]> } {
  return {
    map: (fn) => fakeCursor(docs.map(fn)),
    toArray: async () => docs,
  }
}

vi.mock('@/lib/mongodb', () => ({
  getDb: vi.fn(async () => ({
    collection: (name: string) => {
      if (name === 'users') return { find: usersFindMock }
      if (name === 'notification_log') return { insertOne: logInsertOneMock }
      if (name === 'notification_threshold_state') return { findOneAndUpdate: thresholdFindOneAndUpdateMock }
      if (name === 'expenses') return { collectionName: name, find: () => fakeCursor([]) }
      throw new Error(`unexpected collection: ${name}`)
    },
  })),
}))

const sendPushNotificationMock = vi.fn(async () => {})
vi.mock('@/lib/push', () => ({
  sendPushNotification: sendPushNotificationMock,
}))

vi.mock('@/lib/ai/gemini', () => ({
  generateJSON: vi.fn(async () => ({ title: 'AI title', body: 'AI body' })),
}))

const buildExpenseContextMock = vi.fn(async () => ({
  facts: 'FACTS',
  meta: { txnCountThisMonth: 1, totalSpent: 900, totalAssigned: 1000, daysLeft: 5, daysElapsed: 25, totalDaysInMonth: 30 },
  envelopes: [
    {
      category: 'Food',
      group: '',
      assigned: 1000,
      spent: 900,
      available: 100,
      rolledOver: 0,
      isOverspent: false,
      spentPct: 90,
    },
  ],
  subscriptions: [],
  categories: [],
  highlights: { topItem: null, riser: null, pace: null, subscriptionMonthlyBurn: 0, investmentTotal: 0 },
}))
vi.mock('@/lib/ai/expenseContext', () => ({
  buildExpenseContext: buildExpenseContextMock,
}))

const { GET } = await import('./route')

function req(bearer?: string): Request {
  const headers: Record<string, string> = {}
  if (bearer !== undefined) headers.authorization = `Bearer ${bearer}`
  return new Request('https://example.com/api/notifications/run', { headers })
}

describe('GET /api/notifications/run', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-07T03:00:00Z')) // 08:30 IST
    process.env.CRON_SECRET = 'test-secret'
    logInsertOneMock.mockReset().mockResolvedValue({ insertedId: 'x' })
    sendPushNotificationMock.mockReset().mockResolvedValue(undefined)
    usersFindMock.mockReset().mockReturnValue({ toArray: async () => [USER] })
    thresholdFindOneAndUpdateMock.mockReset().mockResolvedValue({ level: 90 })
    buildExpenseContextMock.mockClear()
  })

  it('rejects a request with no bearer token', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('rejects a request with the wrong secret', async () => {
    const res = await GET(req('wrong'))
    expect(res.status).toBe(401)
  })

  it('sends notifications and claims each key in the send log', async () => {
    const res = await GET(req('test-secret'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.sent).toBeGreaterThan(0)
    expect(sendPushNotificationMock).toHaveBeenCalled()
    expect(logInsertOneMock).toHaveBeenCalled()
  })

  it("dates each user's notifications by their own timezone, not IST", async () => {
    // 03:00Z is already Sep 7 in IST but still the evening of Sep 6 in New York.
    usersFindMock.mockReturnValue({
      toArray: async () => [
        { ...USER, _id: 'ist_user', notifyCadence: 'daily' },
        { ...USER, _id: 'ny_user', notifyCadence: 'daily', timezone: 'America/New_York' },
      ],
    })
    await GET(req('test-secret'))
    const logged = logInsertOneMock.mock.calls as unknown as [{ user_id: string; key: string }][]
    const keys = (uid: string) => logged.map(([d]) => d).filter((d) => d.user_id === uid).map((d) => d.key)
    expect(keys('ist_user')).toContain('digest:2026-09-07')
    expect(keys('ny_user')).toContain('digest:2026-09-06')
  })

  it('does not re-send a notification whose key is already claimed', async () => {
    const duplicateKeyError = Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
    logInsertOneMock.mockRejectedValue(duplicateKeyError)

    const res = await GET(req('test-secret'))
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(sendPushNotificationMock).not.toHaveBeenCalled()
  })

  it('skips users whose cadence is off', async () => {
    usersFindMock.mockReturnValue({ toArray: async () => [] })
    const res = await GET(req('test-secret'))
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(buildExpenseContextMock).not.toHaveBeenCalled()
  })
})
