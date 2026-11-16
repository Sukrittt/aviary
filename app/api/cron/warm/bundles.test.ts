import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ command: async () => ({ ok: 1 }) }) }))

const core = await import('./route')

// Each warm route has to share a maxDuration with real routes, or Vercel puts
// it in a function of its own and the cron warms nothing users touch.
describe.each([
  [30, await import('./30/route'), 'app/api/ai/brief/route.ts'],
  [60, await import('./60/route'), 'app/api/expenses/scan/route.ts'],
])('GET /api/cron/warm/%i', (seconds, warm, sibling) => {
  it('is the same ping as /api/cron/warm, in the same function as the AI routes', async () => {
    expect(warm.GET).toBe(core.GET)
    expect(warm.maxDuration).toBe(seconds)
    expect(readFileSync(sibling, 'utf8')).toContain(`export const maxDuration = ${seconds}\n`)
    expect(await (await warm.GET()).json()).toEqual({ ok: true, db: true })
  })
})
