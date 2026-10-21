import { describe, it, expect, vi } from 'vitest'

const requireAccess = vi.fn(async (..._a: unknown[]) => null)
vi.mock('@/lib/access', () => ({ getAuth: async () => ({ userId: 'u1', readOnly: false, sessionId: null, spaceId: 'u1', spaceOwnerId: 'u1', spaceRole: 'owner' as const }), readOnlyGuard: () => null }))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: (...a: unknown[]) => requireAccess(...a) }))
vi.mock('@/lib/import/service', () => ({ importsCollection: async () => ({ findOne: async () => null }) }))
vi.mock('@/lib/import/backfill', () => ({ runImportPass: vi.fn(), retryImport: vi.fn(), passAndChain: vi.fn() }))

const status = await import('./route')
const cont = await import('../continue/route')

describe('import status and continue during onboarding', () => {
  // The done screen polls these before the trial starts: setup-only access must let them through.
  it('status admits an account still in setup', async () => {
    await status.GET(new Request('http://x/api/import/status'))
    expect(requireAccess).toHaveBeenLastCalledWith(expect.anything(), { setup: true })
  })

  it('continue admits an account still in setup', async () => {
    await cont.POST(new Request('http://x/api/import/continue', { method: 'POST', body: JSON.stringify({ importId: 'x' }) })).catch(() => {})
    expect(requireAccess).toHaveBeenLastCalledWith(expect.anything(), { setup: true })
  })
})
