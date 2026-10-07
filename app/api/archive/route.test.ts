import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null })),
  readOnlyGuard: vi.fn(() => null),
}))

vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))
vi.mock('@/lib/categoryMap', () => ({ invalidateCategoryMap: vi.fn() }))

type Doc = Record<string, unknown> & { _id: ObjectId }
const stores: Record<string, Doc[]> = { expenses: [], categories: [], budgets: [], holdings: [], groups: [] }

function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([k, v]) => {
    if (k === '_id' && v instanceof ObjectId) return doc._id.equals(v)
    if (v === null) return doc[k] == null
    if (v && typeof v === 'object' && '$ne' in (v as object)) return doc[k] !== (v as { $ne: unknown }).$ne
    return doc[k] === v
  })
}

function fakeCollection(base: string) {
  const store = (stores[base] ??= [])
  return {
    find: (filter: Record<string, unknown> = {}) => ({
      toArray: async () => store.filter((d) => matches(d, filter)),
    }),
    findOne: async (filter: Record<string, unknown>, _options?: unknown, scopeOpts?: { includeDeleted?: boolean }) => {
      const effective = scopeOpts?.includeDeleted ? filter : { ...filter, deleted_at: null }
      return store.find((d) => matches(d, effective)) ?? null
    },
    restore: async (filter: Record<string, unknown>) => {
      const doc = store.find((d) => matches(d, filter))
      if (doc) doc.deleted_at = null
      return { matchedCount: doc ? 1 : 0 }
    },
    updateMany: async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      const docs = store.filter((d) => matches(d, filter))
      for (const doc of docs) Object.assign(doc, update.$set)
      return { matchedCount: docs.length }
    },
    purge: async (filter: Record<string, unknown>) => {
      const idx = store.findIndex((d) => matches(d, filter))
      if (idx >= 0) store.splice(idx, 1)
      return { acknowledged: true, deletedCount: idx >= 0 ? 1 : 0 }
    },
  }
}

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return { ...actual, getCollection: vi.fn(async (base: string) => fakeCollection(base)) }
})

const { GET, POST, DELETE } = await import('./route')

function getReq(qs = ''): Request {
  return new Request(`https://example.com/api/archive${qs}`)
}
function postReq(body: unknown): Request {
  return new Request('https://example.com/api/archive', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
function deleteReq(body: unknown): Request {
  return new Request('https://example.com/api/archive', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  stores.expenses = []
  stores.categories = []
  stores.budgets = []
  stores.holdings = []
  stores.groups = []
})

describe('GET /api/archive', () => {
  it('lists only archived (soft-deleted) rows, with a computed label and purgesAt', async () => {
    stores.categories.push(
      { _id: new ObjectId(), name: 'Groceries', deleted_at: '2026-01-01T00:00:00.000Z' },
      { _id: new ObjectId(), name: 'Rent', deleted_at: null },
    )
    const res = await GET(getReq('?collection=categories'))
    const body = (await res.json()) as { items: Array<{ label: string; purgesAt: string }> }
    expect(body.items).toHaveLength(1)
    expect(body.items[0].label).toBe('Groceries')
    expect(body.items[0].purgesAt).toBe('2026-01-08T00:00:00.000Z')
  })

  it('rejects an unknown collection', async () => {
    const res = await GET(getReq('?collection=nonsense'))
    expect(res.status).toBe(400)
  })

  it('includes amount for collections that have one, omits it for categories', async () => {
    stores.budgets.push({ _id: new ObjectId(), category: 'Food', month: '2026-01', assigned: 5000, deleted_at: '2026-01-01T00:00:00.000Z' })
    stores.holdings.push({ _id: new ObjectId(), name: 'Index Fund', value: 12000, deleted_at: '2026-01-01T00:00:00.000Z' })
    stores.categories.push({ _id: new ObjectId(), name: 'Groceries', deleted_at: '2026-01-01T00:00:00.000Z' })

    const res = await GET(getReq())
    const body = (await res.json()) as { items: Array<{ collection: string; amount?: number }> }
    const budget = body.items.find((i) => i.collection === 'budgets')
    const holding = body.items.find((i) => i.collection === 'holdings')
    const category = body.items.find((i) => i.collection === 'categories')
    expect(budget?.amount).toBe(5000)
    expect(holding?.amount).toBe(12000)
    expect(category?.amount).toBeUndefined()
  })
})

describe('POST /api/archive (restore)', () => {
  it('restores an archived item by id', async () => {
    const id = new ObjectId()
    stores.categories.push({ _id: id, name: 'Groceries', deleted_at: '2026-01-01T00:00:00.000Z' })

    const res = await POST(postReq({ collection: 'categories', id: id.toString() }))
    expect(res.status).toBe(200)
    expect(stores.categories[0].deleted_at).toBeNull()
  })

  it('brings back the archived group of a restored category', async () => {
    const id = new ObjectId()
    stores.categories.push({ _id: id, name: 'Rent', group: 'Home', deleted_at: '2026-01-01T00:00:00.000Z' })
    stores.groups.push({ _id: new ObjectId(), name: 'Home', deleted_at: '2026-01-01T00:00:00.000Z' })
    const res = await POST(postReq({ collection: 'categories', id: id.toString() }))
    expect(res.status).toBe(200)
    expect(stores.groups[0].deleted_at).toBeNull()
    expect(stores.categories[0].group).toBe('Home')
  })

  it('ungroups a restored category whose group is gone for good', async () => {
    const id = new ObjectId()
    stores.categories.push({ _id: id, name: 'Rent', group: 'Home', deleted_at: '2026-01-01T00:00:00.000Z' })
    await POST(postReq({ collection: 'categories', id: id.toString() }))
    expect(stores.categories[0].group).toBe('')
  })

  it('leaves a restored category alone when its group is live', async () => {
    const id = new ObjectId()
    stores.categories.push({ _id: id, name: 'Rent', group: 'Home', deleted_at: '2026-01-01T00:00:00.000Z' })
    stores.groups.push({ _id: new ObjectId(), name: 'Home', deleted_at: null })
    await POST(postReq({ collection: 'categories', id: id.toString() }))
    expect(stores.categories[0].group).toBe('Home')
  })

  it('rejects restoring when a live item with the same name already exists', async () => {
    const id = new ObjectId()
    stores.categories.push(
      { _id: id, name: 'Groceries', deleted_at: '2026-01-01T00:00:00.000Z' },
      { _id: new ObjectId(), name: 'Groceries', deleted_at: null },
    )

    const res = await POST(postReq({ collection: 'categories', id: id.toString() }))
    expect(res.status).toBe(409)
  })

  it('404s when the id is not actually archived', async () => {
    const id = new ObjectId()
    stores.categories.push({ _id: id, name: 'Groceries', deleted_at: null })

    const res = await POST(postReq({ collection: 'categories', id: id.toString() }))
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/archive (purge)', () => {
  it('permanently removes an archived item', async () => {
    const id = new ObjectId()
    stores.categories.push({ _id: id, name: 'Groceries', deleted_at: '2026-01-01T00:00:00.000Z' })

    const res = await DELETE(deleteReq({ collection: 'categories', id: id.toString() }))
    expect(res.status).toBe(200)
    expect(stores.categories).toHaveLength(0)
  })

  it('404s when the id is not actually archived', async () => {
    const id = new ObjectId()
    stores.categories.push({ _id: id, name: 'Groceries', deleted_at: null })

    const res = await DELETE(deleteReq({ collection: 'categories', id: id.toString() }))
    expect(res.status).toBe(404)
    expect(stores.categories).toHaveLength(1)
  })

  it('rejects an unknown collection', async () => {
    const res = await DELETE(deleteReq({ collection: 'nonsense', id: new ObjectId().toString() }))
    expect(res.status).toBe(400)
  })
})
