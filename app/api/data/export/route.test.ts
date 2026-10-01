import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

let leased = false
vi.mock('@/lib/resourceLease', () => ({ acquireLease: async () => {
  if (leased) return null
  leased = true
  return async () => { leased = false }
} }))
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: async () => false }))

const exportAllowance = vi.fn(async () => ({ usedThisMonth: 0, limit: 3, allowed: true, exitExport: false }))
const buildAndStoreExport = vi.fn(async () => {})

vi.mock('@/lib/exports', () => ({
  EXPORT_LIMIT: 3,
  currentMonthKey: () => '2026-09',
  exportAllowance: (...args: unknown[]) => exportAllowance(...(args as Parameters<typeof exportAllowance>)),
  buildAndStoreExport: (...args: unknown[]) => buildAndStoreExport(...(args as Parameters<typeof buildAndStoreExport>)),
}))

let auth = { userId: 'user_a', readOnly: false, sessionId: null as string | null }
vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => auth),
  readOnlyGuard: vi.fn((a: { readOnly: boolean }, method: string) =>
    a.readOnly && method !== 'GET' ? ({ status: 403 } as unknown) : null,
  ),
}))

const queuedAfter: Array<() => unknown> = []
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => unknown) => queuedAfter.push(fn) }
})

type Doc = Record<string, unknown> & { _id: ObjectId }
const store: Doc[] = []

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async () => ({
      insertOne: async (doc: Record<string, unknown>) => {
        const withId = { ...doc, _id: new ObjectId() } as Doc
        store.push(withId)
        return { insertedId: withId._id }
      },
    })),
  }
})

const { POST } = await import('./route')

function req(): Request {
  return new Request('https://example.com/api/data/export', { method: 'POST' })
}

beforeEach(() => {
  leased = false
  store.length = 0
  queuedAfter.length = 0
  exportAllowance.mockClear().mockResolvedValue({ usedThisMonth: 0, limit: 3, allowed: true, exitExport: false })
  buildAndStoreExport.mockClear()
  auth = { userId: 'user_a', readOnly: false, sessionId: null }
})

describe('POST /api/data/export', () => {
  it('kicks off a background export and returns 202 with remaining quota', async () => {
    exportAllowance.mockResolvedValue({ usedThisMonth: 1, limit: 3, allowed: true, exitExport: false })
    const res = await POST(req())
    expect(res.status).toBe(202)
    const body = (await res.json()) as { id: string; status: string; remaining: number }
    expect(body.status).toBe('pending')
    expect(body.remaining).toBe(2) // limit 3 - used 1 (this pending export doesn't count until ready)
    expect(store).toHaveLength(1)
    expect(store[0].status).toBe('pending')
    expect(store[0].month).toBe('2026-09')

    expect(queuedAfter).toHaveLength(1)
    await queuedAfter[0]()
    expect(buildAndStoreExport).toHaveBeenCalledWith('user_a', body.id)
  })

  it('rejects with 429 once the monthly quota is used, without inserting a doc', async () => {
    exportAllowance.mockResolvedValue({ usedThisMonth: 3, limit: 3, allowed: false, exitExport: false })
    const res = await POST(req())
    expect(res.status).toBe(429)
    expect(store).toHaveLength(0)
    expect(queuedAfter).toHaveLength(0)
  })

  it('starts the post-expiry exit export even with the monthly quota spent', async () => {
    exportAllowance.mockResolvedValue({ usedThisMonth: 3, limit: 3, allowed: true, exitExport: true })
    const res = await POST(req())
    expect(res.status).toBe(202)
    const body = (await res.json()) as { remaining: number; exitExport: boolean }
    expect(body.exitExport).toBe(true)
    expect(body.remaining).toBe(0) // never negative, even though the cap is spent
    expect(queuedAfter).toHaveLength(1)
  })

  it('blocks the read-only demo user', async () => {
    auth = { userId: 'demo', readOnly: true, sessionId: null }
    const res = await POST(req())
    expect(res.status).toBe(403)
    expect(store).toHaveLength(0)
  })
})

it('does not schedule another workbook while the first is pending', async () => {
  expect((await POST(req())).status).toBe(202)
  expect((await POST(req())).status).toBe(409)
  expect(queuedAfter).toHaveLength(1)
})
