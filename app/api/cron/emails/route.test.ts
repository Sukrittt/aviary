import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/email/welcome', () => ({ retryWelcomeEmails: vi.fn(async () => ({ sent: 1, failed: 0, skipped: 0, needs_review: 0, configured: true })) }))
vi.mock('@/lib/cronRuns', () => ({ recordCronRun: vi.fn(async (_job, _trigger, fn) => fn()), triggerOf: () => 'cron' }))
const { retryWelcomeEmails } = await import('@/lib/email/welcome')
const { GET } = await import('./route')
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('CRON_SECRET', 'test-secret') })
afterEach(() => vi.unstubAllEnvs())

it.each([undefined, 'Bearer wrong'])('rejects an unauthorized retry request (%s)', async authorization => {
  const response = await GET(new Request('https://example.com/api/cron/emails', { headers: authorization ? { authorization } : {} }))
  expect(response.status).toBe(401)
  expect(retryWelcomeEmails).not.toHaveBeenCalled()
})

it('retries pending email only for an authorized cron request', async () => {
  const response = await GET(new Request('https://example.com/api/cron/emails', { headers: { authorization: 'Bearer test-secret' } }))
  expect(await response.json()).toMatchObject({ ok: true, sent: 1 })
  expect(retryWelcomeEmails).toHaveBeenCalledOnce()
})
