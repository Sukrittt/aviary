import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const })),
}))

type Doc = Record<string, unknown> & { _id: ObjectId }

let store: Doc[] = []

function fakeCollection() {
  return {
    findOneRaw: async (filter: Record<string, unknown> = {}, options?: { sort?: Record<string, number> }) => {
      const matches = store.filter((d) =>
        Object.entries(filter).every(([k, v]) => d[k] === v),
      )
      if (options?.sort?._id === -1) matches.sort((a, b) => b._id.toString().localeCompare(a._id.toString()))
      return matches[0] ?? null
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

const { GET } = await import('./route')

function req(): Request {
  return new Request('https://example.com/api/privacy/proof')
}

beforeEach(() => {
  store = []
})

describe('GET /api/privacy/proof', () => {
  it('returns the field list from ENCRYPTED_FIELDS.expenses', async () => {
    const res = await GET(req())
    const body = await res.json()
    expect(body.fields).toEqual(['item', 'notes', 'description', 'amount_inr', 'amount'])
  })

  it('returns sample: null when the user has no expenses', async () => {
    const res = await GET(req())
    const body = await res.json()
    expect(body.sample).toBeNull()
  })

  it('returns encrypted fields as ciphertext and plaintext fields as-is, stripping internal keys', async () => {
    store.push({
      _id: new ObjectId(),
      item: 'enc:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa==',
      amount_inr: 'enc:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb==',
      date: '2026-01-15',
      category: 'Food',
      user_id: 'user_a',
      deleted_at: null,
      client_id: 'some-uuid',
    })

    const res = await GET(req())
    const body = await res.json()
    expect(body.sample.item).toMatch(/^enc:v1:/)
    expect(body.sample.amount_inr).toMatch(/^enc:v1:/)
    expect(body.sample.date).toBe('2026-01-15')
    expect(body.sample.category).toBe('Food')
    expect(body.sample.user_id).toBeUndefined()
    expect(body.sample.deleted_at).toBeUndefined()
    expect(body.sample.client_id).toBeUndefined()
    expect(body.sample._id).toBeUndefined()
  })

  it('truncates a long value rather than returning the full ciphertext', async () => {
    store.push({
      _id: new ObjectId(),
      item: `enc:v1:${'a'.repeat(200)}`,
      date: '2026-01-15',
      user_id: 'user_a',
      deleted_at: null,
    })

    const res = await GET(req())
    const body = await res.json()
    expect(body.sample.item.length).toBeLessThan(200)
    expect(body.sample.item.endsWith('…')).toBe(true)
  })
})
