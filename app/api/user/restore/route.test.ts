import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null })),
}))

const restoreMock = vi.fn(async () => {})
vi.mock('@/lib/accountLifecycle', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/accountLifecycle')>(), restoreAccount: restoreMock,
}))

const usersFindOneMock = vi.fn(async (): Promise<{ deleted_at: string | null }> => ({ deleted_at: '2026-01-01T00:00:00+05:30' }))
const usersUpdateOneMock = vi.fn(async () => ({ modifiedCount: 1 }))
vi.mock('@/lib/mongodb', () => ({
  getDb: vi.fn(async () => ({
    collection: vi.fn(() => ({ findOne: usersFindOneMock, updateOne: usersUpdateOneMock })),
  })),
}))

// lib/accountLifecycle.ts imports the server-only WorkOS client for its purge helper.
vi.mock('@/lib/workosClient', () => ({ getWorkOSClient: vi.fn() }))

const { POST } = await import('./route')

beforeEach(() => {
  vi.clearAllMocks()
  usersFindOneMock.mockResolvedValue({ deleted_at: '2026-01-01T00:00:00+05:30' })
})

describe('POST /api/user/restore', () => {
  it('404s when the account is not scheduled for deletion', async () => {
    usersFindOneMock.mockResolvedValue({ deleted_at: null })
    const res = await POST(new Request('https://example.com/api/user/restore', { method: 'POST' }))
    expect(res.status).toBe(404)
    expect(restoreMock).not.toHaveBeenCalled()
  })

  it('restores every collection and clears deleted_at on the account when scheduled for deletion', async () => {
    const res = await POST(new Request('https://example.com/api/user/restore', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(restoreMock).toHaveBeenCalledWith(expect.anything(), 'user_a')
  })
})
