import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null })),
}))

interface Session {
  _id: string
  title: string
  updatedAt: string
  messages: Array<{ role: string; text: string }>
}

let sessions: Session[] = []

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async () => ({
      countDocuments: async () => sessions.length,
      find: (_filter: unknown, options: { projection: Record<string, unknown> }) => {
        if (options.projection.messages) throw new Error('History must not load transcripts')
        let rows = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        const cursor = {
          sort: () => cursor, batchSize: () => cursor, close: async () => {},
          limit: (n: number) => { rows = rows.slice(0, n); return cursor },
          async *[Symbol.asyncIterator]() { yield* rows },
        }
        return cursor
      },
      aggregate: (pipeline: Record<string, unknown>[]) => ({ toArray: async () => {
        let rows = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        for (const stage of pipeline) {
          if (stage.$skip !== undefined) rows = rows.slice(Number(stage.$skip))
          if (stage.$limit !== undefined) rows = rows.slice(0, Number(stage.$limit))
          if (stage.$match) {
            const ids = (stage.$match as { _id: { $in: string[] } })._id.$in
            rows = rows.filter(r => ids.includes(r._id))
          }
        }
        return rows.map(r => ({ ...r, messageCount: r.messages.length, messages: r.messages.slice(-1) }))
      } }),
    })),
  }
})

const { GET } = await import('./route')
const SEARCH_SCAN_LIMIT = 1000 // mirrors route.ts

function req(qs = ''): Request {
  return new Request(`https://example.com/api/ai/chat/sessions${qs}`)
}

function session(id: string, title: string, updatedAt: string, texts: string[]): Session {
  return { _id: id, title, updatedAt, messages: texts.map((text) => ({ role: 'user', text })) }
}

beforeEach(() => {
  sessions = []
})

describe('GET /api/ai/chat/sessions', () => {
  it('returns sessions newest-first with a preview of the last message', async () => {
    sessions = [
      session('1', 'Old chat', '2026-01-01', ['hi']),
      session('2', 'New chat', '2026-01-02', ['first', 'How much did I spend on groceries?']),
    ]
    const res = await GET(req())
    const body = await res.json()
    expect(body.sessions.map((s: { id: string }) => s.id)).toEqual(['2', '1'])
    expect(body.sessions[0].preview).toBe('How much did I spend on groceries?')
    expect(body.sessions[0].messageCount).toBe(2)
    expect(body.total).toBe(2)
  })

  it('filters by title case-insensitively in JS (title is encrypted, no server-side $regex)', async () => {
    sessions = [session('1', 'Grocery spend', '2026-01-01', []), session('2', 'Rent question', '2026-01-02', [])]
    const res = await GET(req('?q=grocery'))
    const body = await res.json()
    expect(body.sessions).toHaveLength(1)
    expect(body.sessions[0].id).toBe('1')
  })

  it('clamps an oversized ?limit= to the server-side max', async () => {
    sessions = Array.from({ length: 150 }, (_, i) => session(String(i), `s${i}`, `2026-01-${String(i % 28).padStart(2, '0')}`, []))
    const res = await GET(req('?limit=100000000'))
    const body = await res.json()
    expect(body.sessions.length).toBeLessThanOrEqual(100)
  })

  it('falls back to the default limit for a non-numeric value', async () => {
    sessions = Array.from({ length: 20 }, (_, i) => session(String(i), `s${i}`, `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, []))
    const res = await GET(req('?limit=abc'))
    const body = await res.json()
    expect(body.sessions.length).toBe(10)
  })

  it('paginates correctly across pages', async () => {
    sessions = Array.from({ length: 5 }, (_, i) => session(String(i), `s${i}`, `2026-01-0${i + 1}`, []))
    const page1 = await (await GET(req('?limit=2&page=1'))).json()
    const page2 = await (await GET(req('?limit=2&page=2'))).json()
    expect(page1.sessions).toHaveLength(2)
    expect(page2.sessions).toHaveLength(2)
    expect(page1.sessions[0].id).not.toBe(page2.sessions[0].id)
    expect(page1.pageCount).toBe(3)
  })

  it('bounds a title search to the newest sessions', async () => {
    sessions = Array.from({ length: SEARCH_SCAN_LIMIT + 1 }, (_, i) =>
      session(`s${i}`, 'Budget', `2026-01-01T00:00:${String(i).padStart(6, '0')}`, []))
    const body = await (await GET(req('?q=budget'))).json()
    expect(body.total).toBe(SEARCH_SCAN_LIMIT)
  })

  it('handles a session with no messages without throwing', async () => {
    sessions = [session('1', 'Empty', '2026-01-01', [])]
    const res = await GET(req())
    const body = await res.json()
    expect(body.sessions[0].preview).toBe('')
    expect(body.sessions[0].messageCount).toBe(0)
  })
})
