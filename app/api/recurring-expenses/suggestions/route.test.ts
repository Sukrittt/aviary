import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
const mocks = vi.hoisted(() => ({ evaluate: vi.fn(), guard: vi.fn(), ai: vi.fn(), allowance: vi.fn(), rate: vi.fn(), reads: vi.fn(), user: 'user_a' }))
vi.mock('@/lib/access', () => ({ getAuth: async () => ({ userId: mocks.user, spaceId: mocks.user, readOnly: false }), readOnlyGuard: mocks.guard }))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: async () => null }))
vi.mock('@/lib/ai/recurringDetection', () => ({ evaluateRecurring: mocks.evaluate }))
vi.mock('@/lib/systemSettings', () => ({ aiDisabledResponse: mocks.ai }))
vi.mock('@/lib/ai/allowance', () => ({ aiAllowanceResponse: mocks.allowance }))
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: mocks.rate }))
vi.mock('@/lib/userCurrency', () => ({ nowForUser: async () => ({ date: '2026-09-22' }), getUserCurrency: async () => 'INR', getBudgetCurrency: async () => 'INR' }))
type Doc = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
let ledger: Doc[]
let schedules: Doc[]
let subscriptions: Doc[]
let saved: Doc[]
function match(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((f: Doc) => match(doc, f))
    if (value instanceof ObjectId) return String(doc[key]) === String(value)
    if (value && typeof value === 'object') {
      if ('$in' in value) return value.$in.some((v: unknown) => String(v) === String(doc[key]))
      if ('$exists' in value) return (doc[key] !== undefined) === value.$exists
      if ('$gte' in value || '$lte' in value) return (!('$gte' in value) || doc[key] >= value.$gte) && (!('$lte' in value) || doc[key] <= value.$lte)
      if ('$ne' in value) return doc[key] != value.$ne
    }
    return doc[key] === value
  })
}
vi.mock('@/lib/http', async original => ({
  ...await original<typeof import('@/lib/http')>(),
  getCollection: async (name: string, auth: { userId: string }) => {
    const data = name === 'expenses' ? ledger : name === 'recurring_expenses' ? schedules : name === 'subscriptions' ? subscriptions : saved
    return {
      find: (filter: Doc, options?: Doc) => {
        mocks.reads(name, filter, options)
        let limit = Infinity
        const cursor = { limit: (n: number) => { limit = n; return cursor }, toArray: async () => data.filter(r => (name !== 'recurring_detection' || r.user_id === auth.userId) && match(r, filter)).slice(0, limit) }
        return cursor
      },
      findOne: async (filter: Doc) => data.find(r => r.user_id === auth.userId && match(r, filter)) ?? null,
      updateOne: async (filter: Doc, update: Doc, options?: Doc) => {
        let doc = data.find(r => r.user_id === auth.userId && match(r, filter))
        if (!doc && options?.upsert) {
          if (data.some(r => String(r._id) === String(filter._id))) throw Object.assign(new Error('duplicate'), { code: 11000 })
          doc = { _id: filter._id, user_id: auth.userId }; data.push(doc)
        }
        if (doc) Object.assign(doc, update.$set)
        return { matchedCount: doc ? 1 : 0 }
      },
    }
  },
}))
import { GET, POST, PATCH } from './route'
const req = (method: string, body?: unknown) => new Request('https://example.com/api/recurring-expenses/suggestions', { method, ...(body ? { body: JSON.stringify(body) } : {}) })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.user = 'user_a'
  mocks.guard.mockReturnValue(null); mocks.ai.mockResolvedValue(null); mocks.allowance.mockResolvedValue(null); mocks.rate.mockResolvedValue(false)
  mocks.evaluate.mockResolvedValue({ pattern: 'subscription', frequency: 'monthly' })
  ledger = ['2026-07-05', '2026-08-05', '2026-09-05'].map(date => ({ _id: new ObjectId(), version: 0, date, item: 'Netflix', amount_inr: '649', category: 'Entertainment' }))
  schedules = []; subscriptions = []; saved = []
})
describe('recurring scan API', () => {
  it('never evaluates on GET; scans once and reuses unchanged decisions', async () => {
    expect((await (await GET(req('GET'))).json()).suggestions).toEqual([])
    expect(mocks.evaluate).not.toHaveBeenCalled()
    const first = await (await POST(req('POST'))).json()
    expect(first.suggestions[0].input.start_date).toBe('2026-10-05')
    await POST(req('POST'))
    expect(mocks.evaluate).toHaveBeenCalledTimes(1)
  })
  it('persists dismissal and isolates users', async () => {
    const first = await (await POST(req('POST'))).json()
    await PATCH(req('PATCH', { id: first.suggestions[0].id }))
    expect((await (await GET(req('GET'))).json()).suggestions).toEqual([])
    await POST(req('POST'))
    expect(mocks.evaluate).toHaveBeenCalledTimes(1)
    mocks.user = 'user_b'
    expect((await PATCH(req('PATCH', { id: first.suggestions[0].id }))).status).toBe(404)
    await POST(req('POST'))
    expect(mocks.evaluate).toHaveBeenCalledTimes(2)
  })
  it('invalidates edited/deleted evidence and excludes tracked subscriptions', async () => {
    await POST(req('POST'))
    ledger[0].amount_inr = '699'
    ledger[0].version++
    expect((await (await GET(req('GET'))).json()).suggestions).toEqual([])
    await POST(req('POST'))
    expect(mocks.evaluate).toHaveBeenCalledTimes(2)
    subscriptions.push({ service: 'Netflix', status: 'active' })
    expect((await (await GET(req('GET'))).json()).suggestions).toEqual([])
    subscriptions = []; ledger.pop()
    expect((await (await GET(req('GET'))).json()).suggestions).toEqual([])
  })
  it('allows a cancelled subscription to be detected again', async () => {
    subscriptions.push({ service: 'Netflix', status: 'cancelled' })
    const result = await (await POST(req('POST'))).json()
    expect(result.suggestions[0]).toMatchObject({ kind: 'subscription', input: { item: 'Netflix' } })
  })
  it('hides accepted subscription ids even if the service is later renamed', async () => {
    const first = await (await POST(req('POST'))).json()
    subscriptions.push({ service: 'Renamed service', suggestion_id: first.suggestions[0].id })
    expect((await (await GET(req('GET'))).json()).suggestions).toEqual([])
  })
  it('caches negative decisions, but retries failures', async () => {
    mocks.evaluate.mockRejectedValueOnce(new Error('timeout'))
    expect((await (await POST(req('POST'))).json()).failed).toBe(1)
    mocks.evaluate.mockResolvedValue(null)
    await POST(req('POST')); await POST(req('POST'))
    expect(mocks.evaluate).toHaveBeenCalledTimes(2)
  })
  it('rejects concurrent scans across requests', async () => {
    let release!: () => void
    let started!: () => void
    const entered = new Promise<void>(resolve => { started = resolve })
    mocks.evaluate.mockImplementationOnce(async () => { started(); await new Promise<void>(resolve => { release = resolve }); return null })
    const first = POST(req('POST'))
    await entered
    expect((await POST(req('POST'))).status).toBe(409)
    release(); await first
    expect(mocks.evaluate).toHaveBeenCalledTimes(1)
  })
  it('enforces read-only and AI gates before calls', async () => {
    mocks.guard.mockReturnValue(new Response(null, { status: 403 }))
    expect((await POST(req('POST'))).status).toBe(403)
    mocks.guard.mockReturnValue(null)
    mocks.ai.mockResolvedValue(new Response(null, { status: 503 }))
    expect((await POST(req('POST'))).status).toBe(503)
    expect(mocks.evaluate).not.toHaveBeenCalled()
  })
})

it('reads history once per scan and only supporting metadata on GET', async () => {
  await GET(req('GET'))
  expect(mocks.reads.mock.calls.filter(([name]) => name === 'expenses')).toHaveLength(0)
  await POST(req('POST'))
  expect(mocks.reads.mock.calls.filter(([name, filter]) => name === 'expenses' && filter.date)).toHaveLength(1)
  mocks.reads.mockClear()
  await GET(req('GET'))
  const reads = mocks.reads.mock.calls.filter(([name]) => name === 'expenses')
  expect(reads).toHaveLength(1)
  expect(reads[0][1]._id.$in).toHaveLength(3)
  expect(reads[0][2].projection).toEqual({ _id: 1, version: 1 })
})
it('validates periods and rejects oversized windows before any model call', async () => {
  expect((await POST(req('POST', { months: 24 }))).status).toBe(400)
  ledger = Array.from({ length: 10001 }, (_, i) => ({ ...ledger[0], _id: new ObjectId(), date: i ? '2026-04-01' : '2026-09-01' }))
  expect((await POST(req('POST', { months: 6 }))).status).toBe(422)
  expect(mocks.evaluate).not.toHaveBeenCalled()
  const shorter = await POST(req('POST', { months: 1 }))
  expect(shorter.status).toBe(200)
  expect((await shorter.json()).windowStart).toBe('2026-08-22')
})
it('supports a twelve-month window for annual subscriptions', async () => {
  const response = await GET(new Request('https://example.com/api/recurring-expenses/suggestions?months=12'))
  expect(response.status).toBe(200)
  expect((await response.json()).windowStart).toBe('2025-09-22')
})
it('limits calls to three concurrently and twelve per scan', async () => {
  const original = ledger
  ledger = Array.from({ length: 15 }, (_, i) => original.map(r => ({ ...r, _id: new ObjectId(), item: `Service ${i}` }))).flat()
  let active = 0
  let peak = 0
  mocks.evaluate.mockImplementation(async () => {
    active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 2))
    active--
    return null
  })
  const result = await (await POST(req('POST'))).json()
  expect(peak).toBe(3)
  expect(mocks.evaluate).toHaveBeenCalledTimes(12)
  expect(result.remaining).toBe(3)
})
it('keeps snapshots separate for each period', async () => {
  await POST(req('POST', { months: 6 }))
  const shorter = await GET(new Request('https://example.com/api/recurring-expenses/suggestions?months=1'))
  expect((await shorter.json()).scannedAt).toBeNull()
})

it('stops starting model calls after the shared deadline and keeps work retryable', async () => {
  vi.useFakeTimers()
  try {
    const original = ledger
    ledger = Array.from({ length: 12 }, (_, i) => original.map(r => ({ ...r, _id: new ObjectId(), item: `Service ${i}` }))).flat()
    let started = 0
    let ready!: () => void
    const entered = new Promise<void>(resolve => { ready = resolve })
    mocks.evaluate.mockImplementation((_candidate: unknown, _caller: unknown, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('deadline')), { once: true })
      if (++started === 3) ready()
    }))
    // Node's native AbortSignal.timeout uses its own timer; replace it explicitly.
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    try {
      const pending = POST(req('POST'))
      await entered
      controller.abort()
      const result = await (await pending).json()
      expect(mocks.evaluate).toHaveBeenCalledTimes(3)
      expect(result.failed).toBe(12)
      expect(result.remaining).toBe(12)
      mocks.evaluate.mockResolvedValue(null)
    } finally { timeout.mockRestore() }
  } finally { vi.useRealTimers() }
})
