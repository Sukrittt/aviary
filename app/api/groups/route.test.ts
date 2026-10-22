import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const })),
  readOnlyGuard: vi.fn(() => null),
}))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: vi.fn(async () => null) }))
vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))

type Doc = Record<string, unknown>
const stores: Record<string, Doc[]> = { groups: [], categories: [] }
const live = (d: Doc) => d.deleted_at == null
let failGroupDelete = false

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async (base: string) => ({
      deleteOne: async (f: { name: string }) => {
        if (failGroupDelete) throw new Error('db down')
        const doc = stores[base].find((d) => live(d) && d.name === f.name)
        if (doc) doc.deleted_at = 'now'
        return { deletedCount: doc ? 1 : 0 }
      },
      find: () => ({ sort: () => ({ limit: () => ({ next: async () => null }) }) }),
      insertOne: async (doc: Doc) => { stores[base].push(doc) },
      findOne: async (f: { name: string }) => stores[base].find((d) => live(d) && d.name === f.name) ?? null,
      updateOne: async (f: { name: string }, u: { $set: Doc }) => {
        const doc = stores[base].find((d) => live(d) && d.name === f.name)
        if (doc) Object.assign(doc, u.$set)
      },
      updateMany: async (f: { group: string }, u: { $set: Doc }, _o?: unknown, scope?: { includeDeleted?: boolean }) => {
        for (const d of stores[base]) if (d.group === f.group && (scope?.includeDeleted || live(d))) Object.assign(d, u.$set)
      },
      deleteMany: async (f: { group: string }) => {
        const docs = stores[base].filter((d) => live(d) && d.group === f.group)
        for (const d of docs) d.deleted_at = 'now'
        return { deletedCount: docs.length }
      },
    })),
  }
})

const { DELETE, POST, PUT } = await import('./route')

function req(method: string, body: unknown): Request {
  return new Request('https://example.com/api/groups', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const deleteReq = (name: string) => req('DELETE', { name })

beforeEach(() => {
  failGroupDelete = false
  stores.groups = [{ name: 'Home' }, { name: 'Archived' }]
  stores.categories = [
    { name: 'Rent', group: 'Home' },
    { name: 'Water', group: 'Home' },
    { name: 'Fuel', group: 'Car' },
  ]
})

describe('DELETE /api/groups', () => {
  it('archives the group and every category in it, leaving others alone', async () => {
    const res = await DELETE(deleteReq('Home'))
    expect(res.status).toBe(200)
    expect(stores.groups.find((g) => g.name === 'Home')?.deleted_at).toBe('now')
    expect(stores.categories.filter((c) => c.deleted_at).map((c) => c.name)).toEqual(['Rent', 'Water'])
  })

  it('archives categories before the group, so a failed delete can be retried', async () => {
    failGroupDelete = true
    await expect(DELETE(deleteReq('Home'))).rejects.toThrow()
    expect(stores.groups.find((g) => g.name === 'Home')?.deleted_at).toBeUndefined()
    failGroupDelete = false
    expect((await DELETE(deleteReq('Home'))).status).toBe(200)
  })

  it('allows deleting the Archived group', async () => {
    const res = await DELETE(deleteReq('Archived'))
    expect(res.status).toBe(200)
  })

  it('404s for an unknown group without touching categories', async () => {
    const res = await DELETE(deleteReq('Nope'))
    expect(res.status).toBe(404)
    expect(stores.categories.some((c) => c.deleted_at)).toBe(false)
  })
})

describe('PUT /api/groups (rename)', () => {
  it('renames archived categories too, so restoring one later finds the group', async () => {
    stores.categories.push({ name: 'Gas', group: 'Home', deleted_at: 'earlier' })
    const res = await PUT(req('PUT', { name: 'Home', newName: 'House' }))
    expect(res.status).toBe(200)
    expect(stores.categories.filter((c) => c.group === 'House').map((c) => c.name)).toEqual(['Rent', 'Water', 'Gas'])
  })

  it('saves a picked icon on the renamed group', async () => {
    const res = await PUT(req('PUT', { name: 'Home', newName: 'House', icon: 'House' }))
    expect(res.status).toBe(200)
    expect(stores.groups.find((g) => g.name === 'House')?.icon).toBe('House')
  })

  it('rejects an icon outside the catalog', async () => {
    const res = await PUT(req('PUT', { name: 'Home', icon: 'NotAnIcon' }))
    expect(res.status).toBe(400)
    expect(stores.groups.find((g) => g.name === 'Home')?.icon).toBeUndefined()
  })

  it('saves a picked color and rejects one outside the set', async () => {
    expect((await PUT(req('PUT', { name: 'Home', color: 'red' }))).status).toBe(400)
    expect((await PUT(req('PUT', { name: 'Home', color: 'coral' }))).status).toBe(200)
    expect(stores.groups.find((g) => g.name === 'Home')?.color).toBe('coral')
  })
})

describe('POST /api/groups', () => {
  it('saves a picked icon and color on the new group', async () => {
    const res = await POST(req('POST', { name: 'Pets', icon: 'PawPrint', color: 'mint' }))
    expect(res.status).toBe(200)
    expect(stores.groups.find((g) => g.name === 'Pets')).toMatchObject({ icon: 'PawPrint', color: 'mint' })
  })

  it('rejects an icon or color outside the catalog without creating the group', async () => {
    expect((await POST(req('POST', { name: 'Pets', icon: 'NotAnIcon' }))).status).toBe(400)
    expect((await POST(req('POST', { name: 'Pets', color: 'red' }))).status).toBe(400)
    expect(stores.groups.find((g) => g.name === 'Pets')).toBeUndefined()
  })
})
