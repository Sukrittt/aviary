import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

vi.mock('@/lib/resourceLease', () => ({ acquireLease: async () => async () => {} }))
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: async () => false }))

const storeBillScanImage = vi.fn(async () => {})
vi.mock('@/lib/billScan', () => ({
  storeBillScanImage: (...args: unknown[]) =>
    storeBillScanImage(...(args as Parameters<typeof storeBillScanImage>)),
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
    getCollection: vi.fn(async (name: string) => ({
      findOne: async (filter: Record<string, unknown>) => name === 'expenses' ? { _id: filter._id } : store.find(d => d.expense_id === filter.expense_id) ?? null,
      countDocuments: async () => store.length,
      insertOne: async (doc: Record<string, unknown>) => {
        const withId = { ...doc, _id: new ObjectId() } as Doc
        store.push(withId)
        return { insertedId: withId._id }
      },
      find: () => ({
        sort: () => ({
          limit: () => ({
            toArray: async () => [...store].sort((a, b) => (a.created_at! < b.created_at! ? 1 : -1)),
          }),
        }),
      }),
    })),
  }
})

const { POST, GET } = await import('./route')

const validBody = {
  image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4AAAAABJRU5ErkJggg==',
  mimeType: 'image/png',
  merchant: 'Blinkit',
  category: 'Groceries',
  date: '2026-09-11',
  total: 900,
  my_share: 880,
  people_count: 2,
  expense_id: '507f1f77bcf86cd799439011',
  items: [
    { name: 'Milk', price: 60, qty: 1, divisor: 1 },
    { name: 'Pizza', price: 800, qty: 1, divisor: 1 },
  ],
}

function req(body: unknown): Request {
  return new Request('https://example.com/api/bills', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  store.length = 0
  queuedAfter.length = 0
  storeBillScanImage.mockClear()
  auth = { userId: 'user_a', readOnly: false, sessionId: null }
})

describe('POST /api/bills', () => {
  it('inserts a pending row and queues the image upload', async () => {
    const res = await POST(req(validBody))
    expect(res.status).toBe(202)
    const body = (await res.json()) as { id: string }

    expect(store).toHaveLength(1)
    expect(store[0]).toMatchObject({
      merchant: 'Blinkit',
      category: 'Groceries',
      total: '900',
      my_share: '880',
      expense_id: '507f1f77bcf86cd799439011',
      image_status: 'pending',
      image_url: null,
    })
    expect(store[0].items).toHaveLength(2)

    expect(queuedAfter).toHaveLength(1)
    await queuedAfter[0]()
    expect(storeBillScanImage).toHaveBeenCalledWith('user_a', body.id, validBody.image, 'image/png')
  })

  it('blocks the read-only demo user', async () => {
    auth = { userId: 'demo', readOnly: true, sessionId: null }
    const res = await POST(req(validBody))
    expect(res.status).toBe(403)
    expect(store).toHaveLength(0)
  })

  it('rejects a disallowed mimeType', async () => {
    const res = await POST(req({ ...validBody, mimeType: 'application/pdf' }))
    expect(res.status).toBe(400)
    expect(store).toHaveLength(0)
  })

  it('rejects an oversized image payload', async () => {
    const res = await POST(req({ ...validBody, image: 'a'.repeat(6_000_001) }))
    expect(res.status).toBe(400)
    expect(store).toHaveLength(0)
  })

  it('rejects a missing merchant', async () => {
    const res = await POST(req({ ...validBody, merchant: '' }))
    expect(res.status).toBe(400)
    expect(store).toHaveLength(0)
  })

  it('rejects an empty items array', async () => {
    const res = await POST(req({ ...validBody, items: [] }))
    expect(res.status).toBe(400)
    expect(store).toHaveLength(0)
  })

  it('rejects an item missing a name', async () => {
    const res = await POST(req({ ...validBody, items: [{ price: 10 }] }))
    expect(res.status).toBe(400)
    expect(store).toHaveLength(0)
  })

  it('rejects a negative total', async () => {
    const res = await POST(req({ ...validBody, total: -1 }))
    expect(res.status).toBe(400)
    expect(store).toHaveLength(0)
  })

  it('rejects a missing expense_id', async () => {
    const res = await POST(req({ ...validBody, expense_id: '' }))
    expect(res.status).toBe(400)
    expect(store).toHaveLength(0)
  })
})

describe('GET /api/bills', () => {
  function getReq(): Request {
    return new Request('https://example.com/api/bills')
  }

  it('lists past scans newest first, without image data', async () => {
    store.push(
      {
        _id: new ObjectId(),
        merchant: 'Blinkit',
        category: 'Groceries',
        date: '2026-09-01',
        total: '900',
        my_share: '880',
        people_count: 2,
        items: [{ name: 'Milk', price: 60 }, { name: 'Pizza', price: 800 }],
        image_status: 'ready',
        created_at: '2026-09-01T10:00:00+05:30',
      } as Doc,
      {
        _id: new ObjectId(),
        merchant: 'Zomato',
        category: 'Food',
        date: '2026-09-05',
        total: '400',
        my_share: '400',
        people_count: 1,
        items: [{ name: 'Burger', price: 400 }],
        image_status: 'pending',
        created_at: '2026-09-05T10:00:00+05:30',
      } as Doc,
    )

    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { bills: Array<{ merchant: string; item_count: number; image_status: string }> }
    expect(body.bills.map((b) => b.merchant)).toEqual(['Zomato', 'Blinkit'])
    expect(body.bills[1].item_count).toBe(2)
    expect(body.bills[0].image_status).toBe('pending')
    expect(body.bills.some((b) => 'image_url' in b)).toBe(false)
  })

  it('returns an empty list when nothing has been scanned', async () => {
    const res = await GET(getReq())
    const body = (await res.json()) as { bills: unknown[] }
    expect(body.bills).toEqual([])
  })
})

it('rejects base64 data that is not the declared image format', async () => {
  expect((await POST(req({ ...validBody, image: 'aGVsbG8=' }))).status).toBe(400)
})
