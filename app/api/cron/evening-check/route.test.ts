import { describe, it, expect, vi, beforeEach } from 'vitest'

const runEveningCheck = vi.fn(async () => ({ sent: 2 }))
vi.mock('@/lib/notifications/eveningCheck', () => ({ runEveningCheck: () => runEveningCheck() }))
const sweepImports = vi.fn(async (_deadline: number, _origin: string) => 1)
vi.mock('@/lib/import/backfill', () => ({ sweepImports: (deadline: number, origin: string) => sweepImports(deadline, origin) }))
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
    expect(await res.json()).toEqual({ ok: true, sent: 2, importPasses: 1 })
  })

  it('sweeps imports with a deadline inside the route ceiling, and survives the sweep failing', async () => {
    sweepImports.mockRejectedValueOnce(new Error('db down'))
    const before = Date.now()
    const res = await GET(req('test-secret'))
    expect(await res.json()).toEqual({ ok: true, sent: 2, importPasses: 0 })
    const [deadline] = sweepImports.mock.calls[0] as unknown as [number]
    expect(sweepImports.mock.calls[0][1]).toBe('https://example.com')
    expect(deadline).toBeGreaterThanOrEqual(before + 49_000)
    expect(deadline).toBeLessThanOrEqual(Date.now() + 50_000)
  })
})
