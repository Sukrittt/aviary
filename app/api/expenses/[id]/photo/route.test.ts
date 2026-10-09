import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

const put = vi.fn(async () => ({ url: 'https://blob.example/raw' }))
const del = vi.fn(async () => {})
vi.mock('@vercel/blob', () => ({
  put: (...a: unknown[]) => put(...(a as [])),
  del: (...a: unknown[]) => del(...(a as [])),
  issueSignedToken: vi.fn(async () => 'token'),
  presignUrl: vi.fn(async (_t: string, { pathname }: { pathname: string }) => ({ presignedUrl: `https://signed.example/${pathname}` })),
}))

type Auth = { userId: string; readOnly: boolean; sessionId: null }
let auth: Auth
vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => auth),
  readOnlyGuard: (a: Auth, method: string) => (a.readOnly && method !== 'GET' ? Response.json({ error: 'read-only' }, { status: 403 }) : null),
}))
let blocked = false
vi.mock('@/lib/billing/guard', () => ({
  requireAccess: vi.fn(async () => (blocked ? Response.json({ error: 'subscription required' }, { status: 402 }) : null)),
}))

type Doc = Record<string, unknown> & { _id: ObjectId; user_id: string }
let docs: Doc[] = []
// Scoped like lib/scoped.ts: a user only ever sees their own rows.
vi.mock('@/lib/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/http')>()),
  getCollection: vi.fn(async (_base: string, a: Auth) => {
    const own = (_id: ObjectId) => docs.find((d) => d.user_id === a.userId && d._id.equals(_id))
    return {
      findOne: async ({ _id }: { _id: ObjectId }) => own(_id) ?? null,
      updateOne: async ({ _id, ...match }: { _id: ObjectId } & Record<string, unknown>, update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }) => {
        const found = own(_id)
        const d = found && Object.entries(match).every(([k, v]) => (found[k] ?? null) === v) ? found : undefined
        if (d) {
          Object.assign(d, update.$set ?? {})
          for (const k of Object.keys(update.$unset ?? {})) delete d[k]
        }
        return { matchedCount: d ? 1 : 0 }
      },
    }
  }),
}))

const { POST, GET, DELETE } = await import('./route')

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const request = (method: string, body?: unknown) =>
  new Request('https://example.com/api/expenses/x/photo', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
const jpeg = { image: Buffer.from('fake jpeg bytes').toString('base64'), mimeType: 'image/jpeg' }

function expense(extra: Record<string, unknown> = {}): Doc {
  const d = { _id: new ObjectId(), user_id: 'user_a', item: 'Plant', version: 3, ...extra }
  docs.push(d)
  return d
}

beforeEach(() => {
  docs = []
  blocked = false
  auth = { userId: 'user_a', readOnly: false, sessionId: null }
  put.mockClear()
  del.mockClear()
})

describe('POST /api/expenses/[id]/photo', () => {
  it('uploads privately, stamps photo_file without bumping version, and returns a signed url', async () => {
    const d = expense()
    const res = await POST(request('POST', jpeg), ctx(String(d._id)))
    expect(res.status).toBe(200)
    // Each upload gets its own file name, so no two uploads share a blob.
    expect(d.photo_file).toMatch(/^[0-9a-f]{16}\.jpg$/)
    expect(await res.json()).toEqual({ ok: true, url: `https://signed.example/expense-photos/user_a/${d._id}-${d.photo_file}` })
    expect(put).toHaveBeenCalledWith(
      `expense-photos/user_a/${d._id}-${d.photo_file}`,
      expect.any(Buffer),
      expect.objectContaining({ access: 'private', addRandomSuffix: false, contentType: 'image/jpeg' }),
    )
    expect(d.version).toBe(3)
  })

  it('deletes the blob it replaced', async () => {
    const d = expense({ photo_file: 'old.png' })
    await POST(request('POST', jpeg), ctx(String(d._id)))
    expect(del).toHaveBeenCalledWith(`expense-photos/user_a/${d._id}-old.png`)
    expect(d.photo_file).toMatch(/\.jpg$/)
  })

  it('deletes what a racing upload stamped, not the file it first read', async () => {
    const d = expense({ photo_file: 'old.png' })
    // Another upload swaps in its own file while this one is uploading.
    put.mockImplementationOnce(async () => { d.photo_file = 'other.jpg'; return { url: '' } })
    expect((await POST(request('POST', jpeg), ctx(String(d._id)))).status).toBe(200)
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith(`expense-photos/user_a/${d._id}-other.jpg`)
    expect(d.photo_file).toMatch(/^[0-9a-f]{16}\.jpg$/)
  })

  it('removes its own blob and 404s when the expense was deleted mid-upload', async () => {
    const d = expense()
    put.mockImplementationOnce(async () => { docs = []; return { url: '' } })
    expect((await POST(request('POST', jpeg), ctx(String(d._id)))).status).toBe(404)
    expect(del).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^expense-photos/user_a/${d._id}-[0-9a-f]{16}\\.jpg$`)))
  })

  it('rejects a malformed id, and 404s another user\'s expense', async () => {
    expect((await POST(request('POST', jpeg), ctx('nope'))).status).toBe(400)
    const theirs = expense({ user_id: 'user_b' })
    expect((await POST(request('POST', jpeg), ctx(String(theirs._id)))).status).toBe(404)
    expect(put).not.toHaveBeenCalled()
  })

  it('rejects unsupported mime types and empty images with 400', async () => {
    const d = expense()
    expect((await POST(request('POST', { ...jpeg, mimeType: 'image/gif' }), ctx(String(d._id)))).status).toBe(400)
    expect((await POST(request('POST', { ...jpeg, image: '' }), ctx(String(d._id)))).status).toBe(400)
    // Inherited object keys aren't mime types.
    expect((await POST(request('POST', { ...jpeg, mimeType: 'constructor' }), ctx(String(d._id)))).status).toBe(400)
    expect(put).not.toHaveBeenCalled()
  })

  it('rejects malformed base64 instead of storing the junk Buffer.from would decode', async () => {
    const d = expense()
    expect((await POST(request('POST', { ...jpeg, image: 'not base64!!' }), ctx(String(d._id)))).status).toBe(400)
    expect(put).not.toHaveBeenCalled()
  })

  it('keys the blob by the canonical lowercase id even when called with uppercase', async () => {
    const d = expense()
    await POST(request('POST', jpeg), ctx(String(d._id).toUpperCase()))
    expect(put).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^expense-photos/user_a/${d._id}-`)), expect.any(Buffer), expect.anything())
  })

  it('rejects images over 5MB decoded with 413', async () => {
    const d = expense()
    const big = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')
    expect((await POST(request('POST', { ...jpeg, image: big }), ctx(String(d._id)))).status).toBe(413)
    const huge = 'A'.repeat(8_000_000)
    expect((await POST(request('POST', { ...jpeg, image: huge }), ctx(String(d._id)))).status).toBe(413)
    expect(put).not.toHaveBeenCalled()
  })

  it('applies the read-only and access guards', async () => {
    const d = expense()
    auth = { userId: 'user_a', readOnly: true, sessionId: null }
    expect((await POST(request('POST', jpeg), ctx(String(d._id)))).status).toBe(403)
    expect((await DELETE(request('DELETE'), ctx(String(d._id)))).status).toBe(403)
    auth = { userId: 'user_a', readOnly: false, sessionId: null }
    blocked = true
    expect((await POST(request('POST', jpeg), ctx(String(d._id)))).status).toBe(402)
    expect((await GET(request('GET'), ctx(String(d._id)))).status).toBe(402)
    expect(put).not.toHaveBeenCalled()
  })
})

describe('GET /api/expenses/[id]/photo', () => {
  it('404s when there is no photo, and returns a signed url when there is', async () => {
    const none = expense()
    expect((await GET(request('GET'), ctx(String(none._id)))).status).toBe(404)
    const d = expense({ photo_file: 'a1.webp' })
    const res = await GET(request('GET'), ctx(String(d._id)))
    expect(await res.json()).toEqual({ url: `https://signed.example/expense-photos/user_a/${d._id}-a1.webp` })
  })
})

describe('DELETE /api/expenses/[id]/photo', () => {
  it('removes the blob and photo_file without bumping version, and is idempotent', async () => {
    const d = expense({ photo_file: 'a1.jpg' })
    const first = await DELETE(request('DELETE'), ctx(String(d._id)))
    expect(await first.json()).toEqual({ ok: true })
    expect(del).toHaveBeenCalledWith(`expense-photos/user_a/${d._id}-a1.jpg`)
    expect(d.photo_file).toBeUndefined()
    expect(d.version).toBe(3)

    const again = await DELETE(request('DELETE'), ctx(String(d._id)))
    expect(again.status).toBe(200)
    expect(del).toHaveBeenCalledTimes(1)
  })
})

describe('DELETE /api/expenses/[id]/photo concurrency', () => {
  it('keeps a replacement stamped while the delete was running', async () => {
    const d = expense({ photo_file: 'a1.png' })
    // A POST lands a new file between DELETE loading the row and clearing it.
    del.mockImplementationOnce(async () => { d.photo_file = 'b2.jpg' })
    expect((await DELETE(request('DELETE'), ctx(String(d._id)))).status).toBe(200)
    expect(d.photo_file).toBe('b2.jpg')
  })
})
