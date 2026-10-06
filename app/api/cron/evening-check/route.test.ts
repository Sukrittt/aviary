import { describe, it, expect, vi, beforeEach } from 'vitest'

const runEveningCheck = vi.fn(async () => ({ sent: 2 }))
vi.mock('@/lib/notifications/eveningCheck', () => ({ runEveningCheck: () => runEveningCheck() }))
vi.mock('@/lib/cronRuns', () => ({
  recordCronRun: (_job: string, _trigger: string, fn: () => Promise<unknown>) => fn(),
  triggerOf: () => 'cron',
}))

const { GET } = await import('./route')

const req = (bearer?: string) =>
  new Request('https://example.com/api/cron/evening-check', { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} })

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret'
  vi.clearAllMocks()
})

describe('GET /api/cron/evening-check', () => {
  it('401s without the cron secret', async () => {
    expect((await GET(req('wrong'))).status).toBe(401)
    expect((await GET(req())).status).toBe(401)
    expect(runEveningCheck).not.toHaveBeenCalled()
  })

  it('runs the check and reports how many were sent', async () => {
    const res = await GET(req('test-secret'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, sent: 2 })
  })
})
