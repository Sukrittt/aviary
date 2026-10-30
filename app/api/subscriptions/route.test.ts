import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const })),
  readOnlyGuard: vi.fn(() => null),
}))

vi.mock('@/lib/cache', () => ({
  invalidate: vi.fn(),
}))

type Doc = Record<string, unknown> & { _id: ObjectId }

let store: Doc[] = []

/** Matches a filter against a doc — handles plain equality, `_id` by value, and
 *  the `{ $regex }` shape the route uses for case-insensitive service lookups. */
function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([k, v]) => {
    if (k === '_id' && v instanceof ObjectId) return doc._id.equals(v)
    if (v && typeof v === 'object' && '$regex' in v) return (v.$regex as RegExp).test(String(doc[k]))
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
    updateOne: async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      const doc = store.find((d) => matches(d, filter))
      if (doc) Object.assign(doc, update.$set)
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

const { POST, PUT } = await import('./route')

function req(method: string, body: unknown): Request {
  return new Request('https://example.com/api/subscriptions', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  store = []
})

describe('POST /api/subscriptions — duplicate guard', () => {
  it('rejects a case-insensitive duplicate service with 409', async () => {
    const first = await POST(req('POST', { service: 'Netflix', amount_inr: '649' }))
    expect(first.status).toBe(200)

    const dupe = await POST(req('POST', { service: 'netflix', amount_inr: '199' }))
    expect(dupe.status).toBe(409)
    expect(store).toHaveLength(1)
  })

  it('allows distinct services', async () => {
    await POST(req('POST', { service: 'Netflix', amount_inr: '649' }))
    const res = await POST(req('POST', { service: 'Spotify', amount_inr: '119' }))
    expect(res.status).toBe(200)
    expect(store).toHaveLength(2)
  })
})

describe('PUT /api/subscriptions — case-insensitive match', () => {
  it('updates a subscription whose stored service differs only in case from the request', async () => {
    await POST(req('POST', { service: 'Netflix', amount_inr: '649' }))

    const res = await PUT(req('PUT', { service: 'netflix', amount_inr: '699' }))
    expect(res.status).toBe(200)
    expect(store[0].amount_inr).toBe('699')
  })

  it('404s when the service does not exist under any case', async () => {
    const res = await PUT(req('PUT', { service: 'Hulu', amount_inr: '100' }))
    expect(res.status).toBe(404)
  })
})

describe('subscription amounts', () => {
  it('POST refuses an amount that is not money', async () => {
    for (const amount_inr of ['abc', '', undefined, '-5', '1e999']) {
      expect((await POST(req('POST', { service: 'Netflix', amount_inr }))).status).toBe(400)
    }
    expect(store).toHaveLength(0)
  })

  it('PUT refuses one too and keeps the old amount', async () => {
    await POST(req('POST', { service: 'Netflix', amount_inr: '649' }))
    expect((await PUT(req('PUT', { service: 'Netflix', amount_inr: 'abc' }))).status).toBe(400)
    expect(store[0].amount_inr).toBe('649')
  })
})
