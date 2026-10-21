import { describe, it, expect, vi } from 'vitest'

const collection = vi.fn((name: string) => ({ collectionName: name }))
vi.mock('./mongodb', () => ({ getDb: async () => ({ collection }), deferUntilCommit: () => false }))

const { getCollection, SpaceAccessError } = await import('./http')

const auth = (over = {}) => ({ userId: 'user_b', readOnly: false, sessionId: null, spaceId: 'sp_home', spaceOwnerId: 'user_a', spaceRole: 'member' as const, ...over })

describe('getCollection budget/person split', () => {
  it('scopes budget collections to the active budget', async () => {
    expect((await getCollection('expenses', auth())).userId).toBe('sp_home')
    expect((await getCollection('categories', auth())).userId).toBe('sp_home')
  })

  it('scopes person collections to the person', async () => {
    expect((await getCollection('chat_sessions', auth())).userId).toBe('user_b')
  })

  it('refuses a budget the request was denied, rather than falling back to another', async () => {
    await expect(getCollection('expenses', auth({ spaceDenied: true }))).rejects.toBeInstanceOf(SpaceAccessError)
    // A person collection is still the person's own.
    expect((await getCollection('chat_sessions', auth({ spaceDenied: true }))).userId).toBe('user_b')
  })
})
