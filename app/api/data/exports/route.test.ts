import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

const exportAllowance = vi.fn(async () => ({
  usedThisMonth: 0,
  limit: 3,
  allowed: true,
  exitExport: false,
  accessExpired: false,
}))

vi.mock('@/lib/exports', () => ({
  EXPORT_LIMIT: 3,
  exportAllowance: (...args: unknown[]) => exportAllowance(...(args as Parameters<typeof exportAllowance>)),
}))

let auth = { userId: 'user_a', readOnly: false, sessionId: null as string | null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const }
vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => auth),
}))

type Doc = Record<string, unknown> & { _id: ObjectId }
const store: Doc[] = []

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async () => ({
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

const { GET } = await import('./route')

function req(): Request {
  return new Request('https://example.com/api/data/exports')
}

beforeEach(() => {
  store.length = 0
  exportAllowance.mockClear().mockResolvedValue({
    usedThisMonth: 0,
    limit: 3,
    allowed: true,
    exitExport: false,
    accessExpired: false,
  })
  auth = { userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const }
})

describe('GET /api/data/exports', () => {
  it('lists past exports newest first, alongside quota usage', async () => {
    store.push(
      { _id: new ObjectId(), status: 'ready', created_at: '2026-09-01T10:00:00+05:30', blob_url: 'https://blob/a.xlsx' } as Doc,
      { _id: new ObjectId(), status: 'pending', created_at: '2026-09-02T10:00:00+05:30' } as Doc,
    )
    exportAllowance.mockResolvedValue({
      usedThisMonth: 1,
      limit: 3,
      allowed: true,
      exitExport: false,
      accessExpired: false,
    })

    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { exports: Array<{ status: string }>; usedThisMonth: number; limit: number; canExport: boolean }
    expect(body.exports.map((e) => e.status)).toEqual(['pending', 'ready'])
    expect(body.usedThisMonth).toBe(1)
    expect(body.limit).toBe(3)
    expect(body.canExport).toBe(true)
  })

  it('reports the exit export as available with the quota spent', async () => {
    exportAllowance.mockResolvedValue({
      usedThisMonth: 3,
      limit: 3,
      allowed: true,
      exitExport: true,
      accessExpired: true,
    })

    const body = (await (await GET(req())).json()) as {
      canExport: boolean
      exitExport: boolean
      accessExpired: boolean
      usedThisMonth: number
    }
    expect(body).toMatchObject({ canExport: true, exitExport: true, accessExpired: true, usedThisMonth: 3 })
  })

  it('keeps expired state after the final exit export is consumed', async () => {
    exportAllowance.mockResolvedValue({
      usedThisMonth: 3,
      limit: 3,
      allowed: false,
      exitExport: false,
      accessExpired: true,
    })

    const body = (await (await GET(req())).json()) as {
      canExport: boolean
      exitExport: boolean
      accessExpired: boolean
    }
    expect(body).toMatchObject({ canExport: false, exitExport: false, accessExpired: true })
  })

  it('reports no export available once the quota is spent with access intact', async () => {
    exportAllowance.mockResolvedValue({
      usedThisMonth: 3,
      limit: 3,
      allowed: false,
      exitExport: false,
      accessExpired: false,
    })

    const body = (await (await GET(req())).json()) as {
      canExport: boolean
      exitExport: boolean
      accessExpired: boolean
    }
    expect(body).toMatchObject({ canExport: false, exitExport: false, accessExpired: false })
  })

  it('blocks the read-only demo user', async () => {
    auth = { userId: 'demo', readOnly: true, sessionId: null, spaceId: 'demo', spaceOwnerId: 'demo', spaceRole: 'owner' as const }
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('surfaces the stored failure reason for a failed export', async () => {
    store.push({
      _id: new ObjectId(),
      status: 'failed',
      created_at: '2026-09-01T10:00:00+05:30',
      error: 'Vercel Blob: No blob credentials found.',
    } as Doc)

    const res = await GET(req())
    const body = (await res.json()) as { exports: Array<{ status: string; error: string | null }> }
    expect(body.exports[0].error).toBe('Vercel Blob: No blob credentials found.')
  })

  it('returns null error for a ready export', async () => {
    store.push({ _id: new ObjectId(), status: 'ready', created_at: '2026-09-01T10:00:00+05:30', blob_url: 'https://blob/a.xlsx' } as Doc)

    const res = await GET(req())
    const body = (await res.json()) as { exports: Array<{ error: string | null }> }
    expect(body.exports[0].error).toBeNull()
  })
})
