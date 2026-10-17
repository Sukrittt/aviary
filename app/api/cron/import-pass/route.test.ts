import { describe, it, expect, vi, beforeEach } from 'vitest'

const passAndChain = vi.fn(async (..._args: unknown[]) => {})
const afterCallbacks: (() => unknown)[] = []
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), after: (fn: () => unknown) => afterCallbacks.push(fn) }))
vi.mock('@/lib/import/backfill', () => ({ passAndChain: (...a: unknown[]) => passAndChain(...a) }))

const { POST } = await import('./route')

const req = (body: unknown, bearer?: string) => new Request('https://example.com/api/cron/import-pass', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
  body: JSON.stringify(body),
})
const id = '6710e6f0a1b2c3d4e5f60718'

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret'
  vi.clearAllMocks()
  afterCallbacks.length = 0
})

describe('POST /api/cron/import-pass', () => {
  it('401s without the cron secret, so no one else can drive a pass', async () => {
    expect((await POST(req({ userId: 'u', importId: id }, 'wrong'))).status).toBe(401)
    expect((await POST(req({ userId: 'u', importId: id }))).status).toBe(401)
    expect(afterCallbacks).toHaveLength(0)
  })

  it('runs the pass for that user after answering', async () => {
    const res = await POST(req({ userId: 'user_a', importId: id }, 'test-secret'))
    expect(res.status).toBe(200)
    await afterCallbacks[0]()
    expect(passAndChain.mock.calls[0]).toEqual([{ userId: 'user_a', readOnly: false, sessionId: null }, id, expect.any(Number), 'https://example.com'])
  })

  it('rejects a malformed body', async () => {
    expect((await POST(req({ userId: 'u', importId: 'nope' }, 'test-secret'))).status).toBe(400)
  })
})
