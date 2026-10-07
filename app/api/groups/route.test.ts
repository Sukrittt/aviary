import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null })),
  readOnlyGuard: vi.fn(() => null),
}))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: vi.fn(async () => null) }))
vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))

type Doc = Record<string, unknown>
const stores: Record<string, Doc[]> = { groups: [], categories: [] }
const live = (d: Doc) => d.deleted_at == null

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async (base: string) => ({
      deleteOne: async (f: { name: string }) => {
        const doc = stores[base].find((d) => live(d) && d.name === f.name)
        if (doc) doc.deleted_at = 'now'
        return { deletedCount: doc ? 1 : 0 }
      },
      deleteMany: async (f: { group: string }) => {
        const docs = stores[base].filter((d) => live(d) && d.group === f.group)
        for (const d of docs) d.deleted_at = 'now'
        return { deletedCount: docs.length }
      },
    })),
  }
})

const { DELETE } = await import('./route')

function deleteReq(name: string): Request {
  return new Request('https://example.com/api/groups', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

beforeEach(() => {
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
