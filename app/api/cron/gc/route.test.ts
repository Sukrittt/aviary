import { describe, it, expect, vi, beforeEach } from 'vitest'

const deleteManyMocks: Record<string, ReturnType<typeof vi.fn>> = {}
function collectionDeleteMany(name: string) {
  return (deleteManyMocks[name] ??= vi.fn(async () => ({ deletedCount: 0 })))
}

const usersFindMock = vi.fn((): { toArray: () => Promise<Array<{ _id: string; deleted_at: string }>> } => ({ toArray: async () => [] }))
const usersDeleteOneMock = vi.fn(async () => ({ deletedCount: 1 }))
const billingDeleteOneMock = vi.fn(async () => ({ deletedCount: 1 }))
const deleteUserMock = vi.fn(async () => undefined)

vi.mock('@/lib/mongodb', () => ({
  getDb: vi.fn(async () => ({
    collection: (name: string) => {
      if (name === 'users') return { find: usersFindMock, deleteOne: usersDeleteOneMock }
      if (name === 'billing_accounts') return { deleteOne: billingDeleteOneMock }
      return { deleteMany: collectionDeleteMany(name) }
    },
  })),
}))

vi.mock('@/lib/workosClient', () => ({
  getWorkOSClient: vi.fn(() => ({ userManagement: { deleteUser: deleteUserMock } })),
}))

const { GET } = await import('./route')

function req(bearer?: string): Request {
  const headers: Record<string, string> = {}
  if (bearer !== undefined) headers.authorization = `Bearer ${bearer}`
  return new Request('https://example.com/api/cron/gc', { headers })
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret'
  vi.clearAllMocks()
  usersFindMock.mockReturnValue({ toArray: async () => [] })
  usersDeleteOneMock.mockResolvedValue({ deletedCount: 1 })
})

describe('GET /api/cron/gc', () => {
  it('401s without the correct bearer secret', async () => {
    const res = await GET(req('wrong-secret'))
    expect(res.status).toBe(401)
    expect(deleteUserMock).not.toHaveBeenCalled()
  })

  it('401s with no authorization header at all', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('purges expired archived rows from every archivable collection', async () => {
    collectionDeleteMany('expenses').mockResolvedValue({ deletedCount: 3 })
    collectionDeleteMany('budgets').mockResolvedValue({ deletedCount: 1 })

    const res = await GET(req('test-secret'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; purged: number }
    expect(body.purged).toBe(4)

    // Every collection's deleteMany filters on rows archived past the grace window.
    const [filter] = collectionDeleteMany('expenses').mock.calls[0]
    expect(filter.deleted_at.$ne).toBeNull()
    expect(typeof filter.deleted_at.$lt).toBe('string')
  })

  it('finishes an account deletion: removes the WorkOS user before the local row, then counts it', async () => {
    usersFindMock.mockReturnValue({ toArray: async () => [{ _id: 'user_a', deleted_at: '2020-01-01T00:00:00+05:30' }] })

    const res = await GET(req('test-secret'))
    const body = (await res.json()) as { accountsPurged: number }
    expect(body.accountsPurged).toBe(1)
    expect(deleteUserMock).toHaveBeenCalledWith('user_a')
    expect(usersDeleteOneMock).toHaveBeenCalledWith({ _id: 'user_a' })
    // The trial record goes with the account.
    expect(billingDeleteOneMock).toHaveBeenCalledWith({ _id: 'user_a' })

    const workosOrder = deleteUserMock.mock.invocationCallOrder[0]
    const localOrder = usersDeleteOneMock.mock.invocationCallOrder[0]
    expect(workosOrder).toBeLessThan(localOrder)
  })

  it('does not purge the local user row when the WorkOS deletion fails, so it can retry next run', async () => {
    usersFindMock.mockReturnValue({ toArray: async () => [{ _id: 'user_a', deleted_at: '2020-01-01T00:00:00+05:30' }] })
    deleteUserMock.mockRejectedValueOnce(new Error('workos down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(req('test-secret'))
    const body = (await res.json()) as { accountsPurged: number }
    expect(body.accountsPurged).toBe(0)
    expect(usersDeleteOneMock).not.toHaveBeenCalled()

    consoleError.mockRestore()
  })
})

it('purges account-only collections before discarding the account', async () => {
  usersFindMock.mockReturnValue({ toArray: async () => [{ _id: 'user_a', deleted_at: '2020-01-01T00:00:00Z' }] })
  await GET(req('test-secret'))
  for (const name of ['chat_sessions', 'bill_scans', 'exports', 'holding_events', 'push_tokens']) {
    expect(collectionDeleteMany(name)).toHaveBeenCalledWith({ user_id: 'user_a' })
  }
})
