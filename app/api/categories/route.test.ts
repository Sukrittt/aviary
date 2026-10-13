import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null })),
  readOnlyGuard: vi.fn(() => null),
}))

const invalidateMock = vi.fn()
vi.mock('@/lib/cache', () => ({ invalidate: invalidateMock }))

// These tests drive in-memory collection doubles, so there is no real client to
// start a session on; run the transaction callback inline.
vi.mock('@/lib/mongodb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mongodb')>()),
  withTx: async (fn: (session: unknown) => unknown) => fn(undefined),
}))

interface Doc {
  name: string
  group?: string
  order?: number
  alertPcts?: number[]
  icon?: string
}

let docs: Doc[]

function applyUpdate(doc: Doc, update: { $set?: Partial<Doc>; $unset?: Record<string, ''> }) {
  if (update.$set) Object.assign(doc, update.$set)
  if (update.$unset) for (const key of Object.keys(update.$unset)) delete (doc as unknown as Record<string, unknown>)[key]
}

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async () => ({
      find: () => ({ sort: () => ({ toArray: async () => docs }) }),
      findOne: async (filter: { name: string }) => docs.find((d) => d.name === filter.name) ?? null,
      updateOne: async (filter: { name: string }, update: { $set?: Partial<Doc>; $unset?: Record<string, ''> }) => {
        const doc = docs.find((d) => d.name === filter.name)
        if (doc) applyUpdate(doc, update)
        return { matchedCount: doc ? 1 : 0 }
      },
    })),
  }
})

const { GET, PUT } = await import('./route')

function putBody(body: Record<string, unknown>) {
  return PUT(
    new Request('https://example.com/api/categories', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  docs = [{ name: 'Food', group: 'Living', order: 0 }]
  invalidateMock.mockClear()
})

describe('GET /api/categories', () => {
  it('includes alertPcts only when the doc has it', async () => {
    docs = [
      { name: 'Food', alertPcts: [50, 90] },
      { name: 'Rent' },
    ]
    const res = await GET(new Request('https://example.com/api/categories'))
    const body = await res.json()
    expect(body).toEqual([
      { name: 'Food', group: '', alertPcts: [50, 90] },
      { name: 'Rent', group: '' },
    ])
  })
})

describe('PUT /api/categories — alertPcts', () => {
  it('unsets alertPcts when given null', async () => {
    docs[0].alertPcts = [50, 90]
    const res = await putBody({ name: 'Food', alertPcts: null })
    expect(res.status).toBe(200)
    expect(docs[0].alertPcts).toBeUndefined()
  })

  it('stores a valid array sorted ascending', async () => {
    const res = await putBody({ name: 'Food', alertPcts: [90, 25, 75] })
    expect(res.status).toBe(200)
    expect(docs[0].alertPcts).toEqual([25, 75, 90])
  })

  it('accepts an empty array as an explicit opt-out', async () => {
    docs[0].alertPcts = [50]
    const res = await putBody({ name: 'Food', alertPcts: [] })
    expect(res.status).toBe(200)
    expect(docs[0].alertPcts).toEqual([])
  })

  it('rejects more than 5 values', async () => {
    const res = await putBody({ name: 'Food', alertPcts: [10, 20, 30, 40, 50, 60] })
    expect(res.status).toBe(400)
  })

  it('rejects duplicate values', async () => {
    const res = await putBody({ name: 'Food', alertPcts: [50, 50] })
    expect(res.status).toBe(400)
  })

  it('rejects an out-of-range value', async () => {
    const res = await putBody({ name: 'Food', alertPcts: [50, 150] })
    expect(res.status).toBe(400)
  })

  it('rejects a non-integer value', async () => {
    const res = await putBody({ name: 'Food', alertPcts: [50.5] })
    expect(res.status).toBe(400)
  })
})

describe('/api/categories — icon', () => {
  it('returns a known icon and drops an unknown one', async () => {
    docs = [
      { name: 'Rent', icon: 'House' },
      { name: 'Food', icon: 'NotAnIcon' },
    ]
    const res = await GET(new Request('https://example.com/api/categories'))
    expect(await res.json()).toEqual([
      { name: 'Rent', group: '', icon: 'House' },
      { name: 'Food', group: '' },
    ])
  })

  it('stores a picked icon', async () => {
    const res = await putBody({ name: 'Food', icon: 'ForkKnife' })
    expect(res.status).toBe(200)
    expect(docs[0].icon).toBe('ForkKnife')
  })

  it('rejects an icon outside the catalog', async () => {
    const res = await putBody({ name: 'Food', icon: '<script>' })
    expect(res.status).toBe(400)
    expect(docs[0].icon).toBeUndefined()
  })
})
