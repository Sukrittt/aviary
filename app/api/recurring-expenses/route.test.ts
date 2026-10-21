import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

// Per-user "now" reads the users collection; these suites fake the clock via `nowIST` instead.
vi.mock('@/lib/userCurrency', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/userCurrency')>()),
  nowForUser: async () => (await import('@/lib/http')).nowIST(),
}))


const auth = { userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const }
const readOnlyGuard = vi.fn(() => null as Response | null)

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => auth),
  readOnlyGuard: (...args: unknown[]) => readOnlyGuard(...(args as [])),
}))

vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))

type Doc = Record<string, unknown> & { _id: ObjectId }

let store: Doc[] = []

function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([k, v]) =>
    k === '_id' && v instanceof ObjectId ? doc._id.equals(v) : doc[k] === v,
  )
}

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    // Freeze "today" so next_run_date is deterministic.
    nowIST: () => ({ date: '2026-09-07', timestamp: '2026-09-07T10:00:00' }),
    getCollection: vi.fn(async () => ({
      find: () => ({ toArray: async () => store }),
      findOne: async (filter: Record<string, unknown>) => store.find((d) => matches(d, filter)) ?? null,
      insertOne: async (doc: Record<string, unknown>) => {
        const withId = { ...doc, _id: new ObjectId() } as Doc
        store.push(withId)
        return { insertedId: withId._id }
      },
      updateOne: async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
        const doc = store.find((d) => matches(d, filter))
        if (doc) Object.assign(doc, update.$set)
        return { matchedCount: doc ? 1 : 0 }
      },
      deleteOne: async (filter: Record<string, unknown>) => {
        const idx = store.findIndex((d) => matches(d, filter))
        if (idx >= 0) store.splice(idx, 1)
        return { deletedCount: idx >= 0 ? 1 : 0 }
      },
    })),
  }
})

const { GET, POST, PUT, DELETE } = await import('./route')

function req(method: string, body: unknown): Request {
  return new Request('https://example.com/api/recurring-expenses', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const valid = {
  item: 'Rent',
  amount_inr: '25000',
  category: 'Housing',
  frequency: 'monthly',
  start_date: '2026-09-15',
}

beforeEach(() => {
  store = []
  readOnlyGuard.mockReturnValue(null)
})

describe('POST', () => {
  it('creates a recurrence with server-computed next_run_date and active status', async () => {
    const res = await POST(req('POST', valid))
    expect(res.status).toBe(200)

    expect(store).toHaveLength(1)
    expect(store[0]).toMatchObject({
      item: 'Rent',
      frequency: 'monthly',
      start_date: '2026-09-15',
      next_run_date: '2026-09-15',
      end_date: '',
      status: 'active',
      payment_method: 'bank',
    })
  })

  it('walks a backdated start forward, so creating one never backfills history', async () => {
    await POST(req('POST', { ...valid, start_date: '2026-01-15' }))
    expect(store[0].next_run_date).toBe('2026-09-15')
  })

  it('ignores a client-supplied next_run_date', async () => {
    await POST(req('POST', { ...valid, next_run_date: '2020-01-01' }))
    expect(store[0].next_run_date).toBe('2026-09-15')
  })

  it('rejects missing required fields', async () => {
    const res = await POST(req('POST', { item: 'Rent' }))
    expect(res.status).toBe(400)
    expect(store).toHaveLength(0)
  })

  it('rejects an unknown frequency', async () => {
    const res = await POST(req('POST', { ...valid, frequency: 'fortnightly' }))
    expect(res.status).toBe(400)
    expect(store).toHaveLength(0)
  })

  it('rejects a malformed date and an end_date before start_date', async () => {
    expect((await POST(req('POST', { ...valid, start_date: '15-09-2026' }))).status).toBe(400)
    expect((await POST(req('POST', { ...valid, end_date: '2026-09-01' }))).status).toBe(400)
    expect(store).toHaveLength(0)
  })

  it('rejects an unknown payment_method', async () => {
    expect((await POST(req('POST', { ...valid, payment_method: 'upi' }))).status).toBe(400)
  })

  it('is blocked for a read-only (demo) caller', async () => {
    readOnlyGuard.mockReturnValue(new Response('forbidden', { status: 403 }))
    const res = await POST(req('POST', valid))
    expect(res.status).toBe(403)
    expect(store).toHaveLength(0)
  })
})

describe('PUT', () => {
  async function seed() {
    await POST(req('POST', valid))
    return String(store[0]._id)
  }

  it('pauses and resumes via status', async () => {
    const id = await seed()

    await PUT(req('PUT', { id, status: 'paused' }))
    expect(store[0].status).toBe('paused')

    await PUT(req('PUT', { id, status: 'active' }))
    expect(store[0].status).toBe('active')
  })

  it('resuming skips the paused stretch instead of backfilling it', async () => {
    await POST(req('POST', { ...valid, start_date: '2026-01-15' }))
    const id = String(store[0]._id)

    // Pausing freezes the schedule: the cron only reads active rows, so
    // next_run_date sits where it was when the user paused.
    await PUT(req('PUT', { id, status: 'paused' }))
    store[0].next_run_date = '2026-03-15'

    await PUT(req('PUT', { id, status: 'active' }))

    // Without the recompute this stays 2026-03-15 and the next cron run logs
    // every occurrence from March through today in one go.
    expect(store[0].next_run_date).toBe('2026-09-15')
  })

  it('pausing leaves next_run_date alone', async () => {
    await POST(req('POST', valid))
    const id = String(store[0]._id)

    await PUT(req('PUT', { id, status: 'paused' }))

    expect(store[0].next_run_date).toBe('2026-09-15')
  })

  it('does not reschedule an already-active recurrence sent status: active', async () => {
    await POST(req('POST', { ...valid, start_date: '2026-01-15' }))
    const id = String(store[0]._id)
    store[0].next_run_date = '2026-03-15'

    await PUT(req('PUT', { id, status: 'active' }))

    // Still active, so this isn't a resume — a due date owed since March is a
    // missed run, and the cron's backfill is exactly what should catch it up.
    expect(store[0].next_run_date).toBe('2026-03-15')
  })

  it('recomputes next_run_date when the frequency changes', async () => {
    const id = await seed()
    await PUT(req('PUT', { id, frequency: 'weekly' }))

    // Weekly from 2026-09-15 — still the first occurrence on/after today.
    expect(store[0].frequency).toBe('weekly')
    expect(store[0].next_run_date).toBe('2026-09-15')
  })

  it('recomputes next_run_date when the start date moves backwards', async () => {
    const id = await seed()
    await PUT(req('PUT', { id, start_date: '2026-01-15' }))
    expect(store[0].next_run_date).toBe('2026-09-15')
  })

  it('leaves next_run_date alone for an amount-only edit', async () => {
    const id = await seed()
    await PUT(req('PUT', { id, amount_inr: '30000' }))
    expect(store[0].amount_inr).toBe('30000')
    expect(store[0].next_run_date).toBe('2026-09-15')
  })

  it('rejects an unknown status and a missing or unknown id', async () => {
    const id = await seed()
    expect((await PUT(req('PUT', { id, status: 'cancelled' }))).status).toBe(400)
    expect((await PUT(req('PUT', { status: 'paused' }))).status).toBe(400)
    expect((await PUT(req('PUT', { id: new ObjectId().toString(), status: 'paused' }))).status).toBe(404)
  })

  it('rejects an end_date that would precede the stored start_date', async () => {
    const id = await seed()
    expect((await PUT(req('PUT', { id, end_date: '2026-09-01' }))).status).toBe(400)
  })
})

describe('GET / DELETE', () => {
  it('returns rows carrying an id alongside the header-shaped fields', async () => {
    await POST(req('POST', valid))
    const body = await (await GET(new Request('https://example.com/api/recurring-expenses'))).json()

    expect(body.headers).toContain('next_run_date')
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].id).toBe(String(store[0]._id))
    expect(body.rows[0].item).toBe('Rent')
  })

  it('deletes by id and 404s for an unknown one', async () => {
    await POST(req('POST', valid))
    const id = String(store[0]._id)

    expect((await DELETE(req('DELETE', { id: new ObjectId().toString() }))).status).toBe(404)
    expect((await DELETE(req('DELETE', { id }))).status).toBe(200)
    expect(store).toHaveLength(0)
  })
})
