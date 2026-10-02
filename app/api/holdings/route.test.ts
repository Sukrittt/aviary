import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'

// Per-user "now" reads the users collection; these suites fake the clock via `nowIST` instead.
vi.mock('@/lib/userCurrency', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/userCurrency')>()),
  nowForUser: async () => (await import('@/lib/http')).nowIST(),
}))


vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null })),
  readOnlyGuard: vi.fn(() => null),
}))

vi.mock('@/lib/cache', () => ({
  invalidate: vi.fn(),
}))

vi.mock('@/lib/mongodb', () => ({
  withTx: async (fn: (session: undefined) => Promise<unknown>) => fn(undefined),
}))

type Doc = Record<string, unknown> & { _id: ObjectId }

let store: Doc[] = []

/** Matches a filter against a doc — handles plain equality, `_id` by value, and
 *  the `{ $regex }` shape the route uses for case-insensitive name lookups. */
function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([k, v]) => {
    if (k === '_id' && v instanceof ObjectId) return doc._id.equals(v)
    if (v && typeof v === 'object' && '$regex' in v) return (v.$regex as RegExp).test(String(doc[k]))
    if (v && typeof v === 'object' && '$exists' in v) return (k in doc) === Boolean(v.$exists)
    return doc[k] === v
  })
}

function fakeCollection() {
  return {
    find: (filter: Record<string, unknown> = {}) => ({
      toArray: async () => store.filter((d) => matches(d, filter)),
    }),
    findOne: async (filter: Record<string, unknown>) => store.find((d) => matches(d, filter)) ?? null,
    insertOne: async (doc: Record<string, unknown>) => {
      const withId = { ...doc, _id: new ObjectId() } as Doc
      store.push(withId)
      return { insertedId: withId._id }
    },
    updateOne: async (filter: Record<string, unknown>, update: { $set: Record<string, unknown>; $inc?: Record<string, number> }) => {
      const doc = store.find((d) => matches(d, filter))
      if (doc) {
        Object.assign(doc, update.$set)
        for (const [key, amount] of Object.entries(update.$inc ?? {})) {
          doc[key] = Number(doc[key] ?? 0) + amount
        }
      }
      return { matchedCount: doc ? 1 : 0 }
    },
    deleteOne: async (filter: Record<string, unknown>) => {
      const idx = store.findIndex((d) => matches(d, filter))
      if (idx >= 0) store.splice(idx, 1)
      return { deletedCount: idx >= 0 ? 1 : 0 }
    },
  }
}

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async () => fakeCollection()),
  }
})

const { GET, PUT } = await import('./route')

function req(method: string, body: unknown): Request {
  return new Request('https://example.com/api/holdings', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  store = []
  // Fixes nowIST()'s snapshot so recurring_day/recurring_last_run assertions
  // below are deterministic. 10:00 UTC + 5:30 IST offset = 15:30 IST, so the
  // IST calendar date stays 2026-09-07 (no midnight-boundary flake).
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-07T10:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/holdings — next contribution date', () => {
  it('derives the next date from the current user calendar day without persisting it', async () => {
    store.push({ _id: new ObjectId(), name: 'SIP', value: '1000', is_recurring: 'true',
      recurring_amount: '100', recurring_day: '4', recurring_last_run: '2026-08' })
    store.push({ _id: new ObjectId(), name: 'Gold', value: '1000', is_recurring: 'false' })
    const response = await GET(new Request('https://example.com/api/holdings'))
    const body = await response.json()
    expect(body.rows[0].next_contribution_date).toBe('2026-10-04')
    expect(body.rows[1].next_contribution_date).toBeNull()
    expect(store[0]).not.toHaveProperty('next_contribution_date')
    expect(body.headers).not.toContain('next_contribution_date')
  })

  it('uses the account calendar date when it differs from UTC', async () => {
    // Oct 3 in UTC is already Oct 4 in the account's IST timezone.
    vi.setSystemTime(new Date('2026-10-03T22:00:00.000Z'))
    store.push({ _id: new ObjectId(), name: 'SIP', value: '1000', is_recurring: 'true',
      recurring_amount: '100', recurring_day: '4', recurring_last_run: '2026-09' })
    const response = await GET(new Request('https://example.com/api/holdings'))
    expect((await response.json()).rows[0].next_contribution_date).toBe('2026-10-04')
  })
})

describe('PUT /api/holdings — recurring contribution edit', () => {
  it('turns recurring on for an existing non-recurring holding, snapshotting day/last_run, without touching value', async () => {
    store.push({
      _id: new ObjectId(),
      name: 'Bonds',
      type: 'Bonds',
      value: '48000',
      updated_at: '2026-01-01T00:00:00.000Z',
      is_recurring: 'false',
      recurring_amount: '',
      recurring_day: '',
      recurring_last_run: '',
    } as Doc)

    const res = await PUT(req('PUT', { name: 'Bonds', is_recurring: true, recurring_amount: '3600', version: 0 }))
    expect(res.status).toBe(200)

    const updated = store[0]
    expect(updated.value).toBe('48000') // base balance untouched — additive semantics
    expect(updated.is_recurring).toBe('true')
    expect(updated.recurring_amount).toBe('3600')
    expect(updated.recurring_day).toBe('7')
    expect(updated.recurring_last_run).toBe('2026-09')
    expect(updated.version).toBe(1)
  })

  it('updates the amount on an already-recurring holding without resetting its snapshotted day/last_run', async () => {
    store.push({
      _id: new ObjectId(),
      name: 'Mutual Fund SIP',
      type: 'Mutual Fund',
      value: '12000',
      updated_at: '2026-01-01T00:00:00.000Z',
      is_recurring: 'true',
      recurring_amount: '2000',
      recurring_day: '15',
      recurring_last_run: '2026-06',
    } as Doc)

    const res = await PUT(req('PUT', { name: 'Mutual Fund SIP', is_recurring: true, recurring_amount: '3600', version: 0 }))
    expect(res.status).toBe(200)

    const updated = store[0]
    expect(updated.recurring_amount).toBe('3600')
    expect(updated.recurring_day).toBe('15')
    expect(updated.recurring_last_run).toBe('2026-06')
    expect(updated.version).toBe(1)
  })

  it('turns recurring off and clears amount/day/last_run', async () => {
    store.push({
      _id: new ObjectId(),
      name: 'FD',
      type: 'FD',
      value: '5000',
      updated_at: '2026-01-01T00:00:00.000Z',
      is_recurring: 'true',
      recurring_amount: '500',
      recurring_day: '10',
      recurring_last_run: '2026-08',
    } as Doc)

    const res = await PUT(req('PUT', { name: 'FD', is_recurring: false, version: 0 }))
    expect(res.status).toBe(200)

    const updated = store[0]
    expect(updated.is_recurring).toBe('false')
    expect(updated.recurring_amount).toBe('')
    expect(updated.recurring_day).toBe('')
    expect(updated.recurring_last_run).toBe('')
    expect(updated.version).toBe(1)
  })
})
