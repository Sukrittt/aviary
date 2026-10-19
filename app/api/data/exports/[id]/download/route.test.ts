import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

const getExportDownloadUrl = vi.fn(async () => 'https://blob.example/signed?token=abc')
vi.mock('@/lib/exports', () => ({
  getExportDownloadUrl: (...args: unknown[]) => getExportDownloadUrl(...(args as Parameters<typeof getExportDownloadUrl>)),
}))

let auth = { userId: 'user_a', readOnly: false, sessionId: null as string | null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const }
vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => auth),
  spaceGuard: () => null,
}))

type Doc = Record<string, unknown> & { _id: ObjectId }
const store: Doc[] = []

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async () => ({
      findOne: async (filter: { _id: ObjectId }) => store.find((d) => d._id.equals(filter._id)) ?? null,
    })),
  }
})

const { GET } = await import('./route')

function req(): Request {
  return new Request('https://example.com/api/data/exports/x/download')
}

beforeEach(() => {
  store.length = 0
  getExportDownloadUrl.mockClear()
  auth = { userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const }
})

describe('GET /api/data/exports/[id]/download', () => {
  it('mints a signed download url for a ready export', async () => {
    const id = new ObjectId()
    store.push({ _id: id, status: 'ready' } as Doc)

    const res = await GET(req(), { params: Promise.resolve({ id: id.toString() }) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string }
    expect(body.url).toBe('https://blob.example/signed?token=abc')
    expect(getExportDownloadUrl).toHaveBeenCalledWith('user_a', id.toString())
  })

  it('404s for a pending export', async () => {
    const id = new ObjectId()
    store.push({ _id: id, status: 'pending' } as Doc)

    const res = await GET(req(), { params: Promise.resolve({ id: id.toString() }) })
    expect(res.status).toBe(404)
  })

  it('404s for an unknown id', async () => {
    const res = await GET(req(), { params: Promise.resolve({ id: new ObjectId().toString() }) })
    expect(res.status).toBe(404)
  })

  it('400s on a malformed id', async () => {
    const res = await GET(req(), { params: Promise.resolve({ id: 'not-an-id' }) })
    expect(res.status).toBe(400)
  })

  it('blocks the read-only demo user', async () => {
    auth = { userId: 'demo', readOnly: true, sessionId: null, spaceId: 'demo', spaceOwnerId: 'demo', spaceRole: 'owner' as const }
    const res = await GET(req(), { params: Promise.resolve({ id: new ObjectId().toString() }) })
    expect(res.status).toBe(401)
  })
})
