import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImportError } from '@/lib/import/normalize'

const commitImport = vi.fn()
const runImportPass = vi.fn(async () => 'done')
const afterCallbacks: (() => unknown)[] = []

vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), after: (fn: () => unknown) => afterCallbacks.push(fn) }))
vi.mock('@/lib/access', () => ({ getAuth: async () => ({ userId: 'user_a', readOnly: false, sessionId: null }), readOnlyGuard: () => null }))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: vi.fn(async () => null) }))
vi.mock('@/lib/import/commit', async (original) => ({
  ...(await original<typeof import('@/lib/import/commit')>()),
  commitImport: (...a: unknown[]) => commitImport(...a),
}))
vi.mock('@/lib/import/backfill', () => ({ runImportPass: (...a: unknown[]) => runImportPass(...(a as [])) }))

const { POST } = await import('./route')

const req = (body: unknown) => new Request('https://example.com/api/import/commit', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
const edits = { importId: 'imp1', currency: 'INR', direction: 'negative_spend', groups: ['Essentials'], categories: [], accounts: [], salary: { amount: 85000, day: 1 } }

beforeEach(() => {
  vi.clearAllMocks()
  afterCallbacks.length = 0
  commitImport.mockResolvedValue({ importId: 'imp1', total: 8, groupCount: 1, categoryCount: 4, income: 85000 })
})

describe('POST /api/import/commit', () => {
  it('sets up, answers, then runs the first backfill pass after the response with a deadline inside the ceiling', async () => {
    const before = Date.now()
    const res = await POST(req(edits))
    expect(await res.json()).toEqual({ importId: 'imp1', total: 8, groupCount: 1, categoryCount: 4, income: 85000 })
    expect(runImportPass).not.toHaveBeenCalled()
    await afterCallbacks[0]()
    const [, id, deadline] = runImportPass.mock.calls[0] as unknown as [unknown, string, number]
    expect(id).toBe('imp1')
    expect(deadline).toBeGreaterThanOrEqual(before + 49_000)
    expect(deadline).toBeLessThanOrEqual(Date.now() + 50_000)
  })

  it('rejects malformed edits before touching anything', async () => {
    const res = await POST(req({ ...edits, currency: 'XXX' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid' })
    expect(commitImport).not.toHaveBeenCalled()
  })

  it('a second import while one runs is a 409', async () => {
    commitImport.mockRejectedValue(new ImportError('already_importing'))
    expect((await POST(req(edits))).status).toBe(409)
  })
})
