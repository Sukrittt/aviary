import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// lib/access.ts imports @workos-inc/authkit-nextjs at module scope for
// withAuth(), which in turn pulls in next/cache — unavailable outside the
// Next.js runtime, and irrelevant to demoUserId() itself.
vi.mock('@workos-inc/authkit-nextjs', () => ({ withAuth: vi.fn() }))
vi.mock('./lastSeen', () => ({ touchLastSeen: vi.fn(async () => {}) }))
const nextCookies = vi.hoisted(() => ({ value: null as string | null }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => (name === 'aviary-budget' && nextCookies.value ? { value: nextCookies.value } : undefined) }) }))
vi.mock('./spaces', async (original) => ({
  ...(await original<typeof import('./spaces')>()),
  lookupMembership: vi.fn(async () => ({ space: { _id: 'sp_home', owner_id: 'user_a', deleted_at: null }, role: 'member' })),
}))

const ORIGINAL_DEMO_USER_ID = process.env.DEMO_USER_ID

beforeEach(() => {
  delete process.env.DEMO_USER_ID
})

afterEach(() => {
  vi.unstubAllEnvs()
  if (ORIGINAL_DEMO_USER_ID !== undefined) process.env.DEMO_USER_ID = ORIGINAL_DEMO_USER_ID
})

describe('demoUserId', () => {
  it('returns DEMO_USER_ID when set', async () => {
    process.env.DEMO_USER_ID = 'demo_custom'
    const { demoUserId } = await import('./access')
    expect(demoUserId()).toBe('demo_custom')
  })

  it('falls back to "demo" outside production when unset', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const { demoUserId } = await import('./access')
    expect(demoUserId()).toBe('demo')
  })

  it('throws in production when unset, instead of silently using a guessable id', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { demoUserId } = await import('./access')
    expect(() => demoUserId()).toThrow(/DEMO_USER_ID/)
  })
})

describe('getAuth on web', () => {
  it("reads the budget cookie from the page's own request, for a server prefetch that builds a bare Request", async () => {
    const { withAuth } = await import('@workos-inc/authkit-nextjs')
    vi.mocked(withAuth).mockResolvedValue({ user: { id: 'user_b' }, sessionId: 's' } as never)
    nextCookies.value = 'sp_home'
    const { getAuth } = await import('./access')
    expect(await getAuth(new Request('http://server.internal/api/budgets'))).toMatchObject({ userId: 'user_b', spaceId: 'sp_home', spaceOwnerId: 'user_a' })
    nextCookies.value = null
    expect(await getAuth(new Request('http://server.internal/api/budgets'))).toMatchObject({ userId: 'user_b', spaceId: 'user_b' })
  })
})
