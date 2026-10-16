import { describe, it, expect, vi, beforeEach } from 'vitest'

// Per-user "now" reads the users collection; these suites fake the clock via `nowIST` instead.
vi.mock('@/lib/userCurrency', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/userCurrency')>()),
  nowForUser: async () => (await import('@/lib/http')).nowIST(),
}))


/**
 * The recurring-expense pass of the nightly cron. Kept in its own file rather
 * than folded into `route.test.ts`: this one needs `getCollection` faked, which
 * that file deliberately leaves real (its subscription/investment passes fail
 * into their own try/catch and are swallowed).
 *
 * `createExpense` is stubbed here — the insert itself is covered by
 * `lib/createExpense.test.ts`. What's under test is the orchestration: which
 * occurrences fire, what `client_id` each carries, how the schedule advances,
 * and that a backfill sends one push rather than N.
 */

const USER = { _id: 'user_a', notifyCadence: 'off', notifyWrapped: false }

const logInsertOneMock = vi.fn(async () => ({ insertedId: 'x' }))

vi.mock('@/lib/mongodb', () => ({
  getDb: vi.fn(async () => ({
    collection: (name: string) => {
      if (name === 'users') return { find: () => ({ toArray: async () => [USER] }) }
      if (name === 'notification_log') return { insertOne: logInsertOneMock }
      throw new Error(`unexpected collection: ${name}`)
    },
  })),
}))

const sendPushNotificationMock = vi.fn(async (_n: { userId: string; title: string; body: string; data?: unknown }) => {})
vi.mock('@/lib/push', () => ({ sendPushNotification: sendPushNotificationMock }))

const createExpenseMock = vi.fn(async (_auth: unknown, _input: Record<string, unknown>) => ({
  id: 'e1',
  timestamp: '',
  duplicate: false,
}))
vi.mock('@/lib/createExpense', () => ({ createExpense: createExpenseMock }))

vi.mock('@/lib/notifications/instant', () => ({ notifyThresholdCrossed: vi.fn(async () => {}) }))
vi.mock('@/lib/ai/expenseContext', () => ({ buildExpenseContext: vi.fn() }))

type Doc = Record<string, unknown>
let recurrences: Doc[] = []
const updateOneMock = vi.fn(async (_filter: unknown, update: { $set: Doc }) => {
  Object.assign(recurrences[0], update.$set)
  return { matchedCount: 1 }
})

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    nowIST: () => ({ date: '2026-09-07', timestamp: '2026-09-07T10:00:00' }),
    getCollection: vi.fn(async (base: string) => ({
      find: () => ({ toArray: async () => (base === 'recurring_expenses' ? recurrences : []) }),
      updateOne: updateOneMock,
    })),
  }
})

const { GET } = await import('./route')

function run(): Promise<Response> {
  return GET(
    new Request('https://example.com/api/notifications/run', {
      headers: { authorization: 'Bearer test-secret' },
    }),
  )
}

const base = {
  _id: 'rec_1',
  item: 'Rent',
  amount_inr: '25000',
  category: 'Housing',
  notes: '',
  payment_method: 'bank',
  frequency: 'monthly',
  start_date: '2026-09-07',
  end_date: '',
  next_run_date: '2026-09-07',
  status: 'active',
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-07T03:00:00Z')) // 08:30 IST
  process.env.CRON_SECRET = 'test-secret'
  recurrences = []
  createExpenseMock.mockReset().mockResolvedValue({ id: 'e1', timestamp: '', duplicate: false })
  sendPushNotificationMock.mockReset().mockResolvedValue(undefined)
  logInsertOneMock.mockReset().mockResolvedValue({ insertedId: 'x' })
  updateOneMock.mockClear()
})

describe('recurring expenses in the nightly cron', () => {
  it('logs one expense for a recurrence due today and advances the schedule', async () => {
    recurrences = [{ ...base }]
    await run()

    expect(createExpenseMock).toHaveBeenCalledTimes(1)
    const [, input] = createExpenseMock.mock.calls[0]
    expect(input).toMatchObject({
      item: 'Rent',
      amount_inr: '25000',
      category: 'Housing',
      date: '2026-09-07',
      source: 'recurring',
      client_id: 'recur:rec_1:2026-09-07',
      notify: false,
    })
    expect(recurrences[0].next_run_date).toBe('2026-10-07')
    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('does not fire for a recurrence whose next run is still in the future', async () => {
    recurrences = [{ ...base, next_run_date: '2026-09-08' }]
    await run()

    expect(createExpenseMock).not.toHaveBeenCalled()
    expect(updateOneMock).not.toHaveBeenCalled()
    expect(sendPushNotificationMock).not.toHaveBeenCalled()
  })

  it('backfills every missed date on its own date, and sends exactly one push', async () => {
    recurrences = [{ ...base, frequency: 'weekly', start_date: '2026-08-18', next_run_date: '2026-08-18' }]
    await run()

    expect(createExpenseMock).toHaveBeenCalledTimes(3)
    const dates = createExpenseMock.mock.calls.map((c) => c[1].date)
    expect(dates).toEqual(['2026-08-18', '2026-08-25', '2026-09-01'])

    const clientIds = createExpenseMock.mock.calls.map((c) => c[1].client_id)
    expect(new Set(clientIds).size).toBe(3)

    expect(recurrences[0].next_run_date).toBe('2026-09-08')
    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1)
    expect(sendPushNotificationMock.mock.calls[0][0].body).toContain('3 missed dates')
  })

  it('sends no push when every occurrence came back as an already-logged duplicate', async () => {
    createExpenseMock.mockResolvedValue({ id: 'e1', timestamp: '', duplicate: true })
    recurrences = [{ ...base }]
    await run()

    expect(createExpenseMock).toHaveBeenCalledTimes(1)
    expect(sendPushNotificationMock).not.toHaveBeenCalled()
    // The schedule still advances — the date is accounted for either way.
    expect(recurrences[0].next_run_date).toBe('2026-10-07')
  })

  it('skips a paused recurrence entirely', async () => {
    recurrences = [{ ...base, status: 'paused' }]
    await run()
    expect(createExpenseMock).not.toHaveBeenCalled()
  })

  it('skips a recurrence with no category rather than filing an uncategorised expense', async () => {
    recurrences = [{ ...base, category: '' }]
    await run()

    expect(createExpenseMock).not.toHaveBeenCalled()
    // Schedule untouched, so it starts working once a category is picked.
    expect(updateOneMock).not.toHaveBeenCalled()
  })

  it('logs the final occurrence then retires a recurrence past its end date', async () => {
    recurrences = [{ ...base, end_date: '2026-09-30' }]
    await run()

    expect(createExpenseMock).toHaveBeenCalledTimes(1)
    expect(recurrences[0]).toMatchObject({ next_run_date: '2026-10-07', status: 'ended' })
  })

  it('does not send a second push for the same recurrence on the same day', async () => {
    const duplicateKeyError = Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
    logInsertOneMock.mockRejectedValue(duplicateKeyError)
    recurrences = [{ ...base }]
    await run()

    expect(createExpenseMock).toHaveBeenCalledTimes(1)
    expect(sendPushNotificationMock).not.toHaveBeenCalled()
  })

  // A seed script once wrote free-text labels straight into prod, past the
  // route's bank/credit_card check; createExpense rejected them every night.
  it.each([
    ['Debit Card', 'bank'],
    ['Bank Transfer', 'bank'],
    ['Credit Card', 'credit_card'],
  ])('logs a %s row as %s instead of failing every night', async (stored, logged) => {
    recurrences = [{ ...base, payment_method: stored }]
    await run()

    expect(createExpenseMock).toHaveBeenCalledTimes(1)
    expect(createExpenseMock.mock.calls[0][1].payment_method).toBe(logged)
    expect(recurrences[0].next_run_date).toBe('2026-10-07')
  })

  it('pauses a recurrence that can never be logged and tells the user once', async () => {
    recurrences = [{ ...base, amount_inr: '0' }]
    await run()

    expect(createExpenseMock).not.toHaveBeenCalled()
    expect(recurrences[0].status).toBe('paused')
    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1)
    expect(sendPushNotificationMock.mock.calls[0][0]).toMatchObject({ data: { route: '/account/recurring' } })
  })

  it('one broken recurrence does not stop the next one', async () => {
    createExpenseMock.mockRejectedValueOnce(new Error('boom'))
    recurrences = [
      { ...base, _id: 'rec_1' },
      { ...base, _id: 'rec_2', item: 'Gym' },
    ]
    await run()

    expect(createExpenseMock).toHaveBeenCalledTimes(2)
    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1)
  })
})
