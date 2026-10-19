import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

const getBillScanImageUrl = vi.fn(async () => 'https://blob.example/signed')
vi.mock('@/lib/billScan', () => ({
  getBillScanImageUrl: (...args: unknown[]) =>
    getBillScanImageUrl(...(args as Parameters<typeof getBillScanImageUrl>)),
}))

let auth = { userId: 'user_a', readOnly: false, sessionId: null as string | null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const }
vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => auth),
}))

type Doc = Record<string, unknown> & { _id: ObjectId }
let doc: Doc | null = null

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async () => ({
      findOne: async ({ _id }: { _id: ObjectId }) => (doc && doc._id.equals(_id) ? doc : null),
    })),
  }
})

const { GET } = await import('./route')

function req(): Request {
  return new Request('https://example.com/api/bills/x')
}

beforeEach(() => {
  doc = null
  getBillScanImageUrl.mockClear().mockResolvedValue('https://blob.example/signed')
  auth = { userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const }
})

describe('GET /api/bills/[id]', () => {
  it('returns 400 for a malformed id', async () => {
    const res = await GET(req(), { params: Promise.resolve({ id: 'not-an-id' }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the scan does not exist (or belongs to another user)', async () => {
    const res = await GET(req(), { params: Promise.resolve({ id: new ObjectId().toString() }) })
    expect(res.status).toBe(404)
  })

  it('returns full detail with a signed image URL once the image is ready', async () => {
    const id = new ObjectId()
    doc = {
      _id: id,
      merchant: 'Blinkit',
      category: 'Groceries',
      date: '2026-09-01',
      total: '900',
      my_share: '880',
      people_count: 2,
      items: [{ name: 'Milk', price: 60, qty: 1, divisor: 1 }],
      expense_id: 'exp1',
      image_status: 'ready',
      image_ext: 'png',
      created_at: '2026-09-01T10:00:00+05:30',
    }

    const res = await GET(req(), { params: Promise.resolve({ id: id.toString() }) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { image_url: string | null; merchant: string; items: unknown[] }
    expect(body.merchant).toBe('Blinkit')
    expect(body.items).toHaveLength(1)
    expect(body.image_url).toBe('https://blob.example/signed')
    expect(getBillScanImageUrl).toHaveBeenCalledWith('user_a', id.toString(), 'png')
  })

  it('returns a null image URL while the upload is still pending', async () => {
    const id = new ObjectId()
    doc = {
      _id: id,
      merchant: 'Blinkit',
      category: 'Groceries',
      date: '2026-09-01',
      items: [{ name: 'Milk', price: 60 }],
      image_status: 'pending',
      created_at: '2026-09-01T10:00:00+05:30',
    }

    const res = await GET(req(), { params: Promise.resolve({ id: id.toString() }) })
    const body = (await res.json()) as { image_url: string | null }
    expect(body.image_url).toBeNull()
    expect(getBillScanImageUrl).not.toHaveBeenCalled()
  })
})
