import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  docs: [] as Array<{ token: string; user_id: string; platform: string; createdAt: string; updatedAt: string; deleted_at?: string; account_deleted_at?: string }>,
}

function fakeCollection() {
  return {
    findOne: vi.fn(async (filter: { token: string }) => state.docs.find(d => d.token === filter.token) ?? null),
    updateOne: vi.fn(async (
      filter: { token: string; user_id?: string },
      update: { $set: Record<string, unknown>; $setOnInsert?: Record<string, unknown>; $unset?: Record<string, unknown> },
      options?: { upsert?: boolean },
    ) => {
      const doc = state.docs.find((d) => d.token === filter.token && (filter.user_id === undefined || d.user_id === filter.user_id))
      if (!doc) {
        if (!options?.upsert) return { matchedCount: 0 }
        state.docs.push({ ...filter, ...update.$setOnInsert, ...update.$set } as (typeof state.docs)[number])
        return { matchedCount: 0, upsertedCount: 1 }
      }
      Object.assign(doc, update.$set)
      for (const key of Object.keys(update.$unset ?? {})) delete (doc as Record<string, unknown>)[key]
      return { matchedCount: 1 }
    }),
    deleteOne: vi.fn(async (filter: { token: string }) => {
      state.docs = state.docs.filter((d) => d.token !== filter.token)
      return { deletedCount: 1 }
    }),
    insertOne: vi.fn(async (doc: (typeof state.docs)[number]) => {
      state.docs.push(doc)
      return { insertedId: doc.token }
    }),
  }
}

vi.mock('./mongodb', () => ({
  getDb: vi.fn(async () => ({
    collection: vi.fn(() => fakeCollection()),
  })),
}))

const { registerPushToken } = await import('./push')

const VALID_TOKEN = 'ExponentPushToken[abc123XYZ_-]'

beforeEach(() => {
  state.docs = []
})

describe('registerPushToken', () => {
  it('rejects a token that does not look like an Expo push token', async () => {
    await expect(registerPushToken('not-a-real-token', 'ios', 'user_a')).rejects.toThrow()
    expect(state.docs).toHaveLength(0)
  })

  it('inserts a brand-new token for its owner', async () => {
    await registerPushToken(VALID_TOKEN, 'ios', 'user_a')
    expect(state.docs).toHaveLength(1)
    expect(state.docs[0]).toMatchObject({ token: VALID_TOKEN, user_id: 'user_a', platform: 'ios' })
  })

  it('updates in place when the same user re-registers the same token', async () => {
    await registerPushToken(VALID_TOKEN, 'ios', 'user_a')
    await registerPushToken(VALID_TOKEN, 'android', 'user_a')
    expect(state.docs).toHaveLength(1)
    expect(state.docs[0].platform).toBe('android')
  })

  // A token belongs to one physical device, so it follows whoever is signed in
  // there now. Refusing used to strand the next account on a phone whose last
  // sign-out never reached the server: it silently got no pushes, ever.
  it('moves the token to the account signed in on the device now', async () => {
    await registerPushToken(VALID_TOKEN, 'ios', 'user_a')
    await registerPushToken(VALID_TOKEN, 'ios', 'user_b')
    expect(state.docs).toHaveLength(1)
    expect(state.docs[0].user_id).toBe('user_b')
  })

  it("takes over a token archived with a deleted account, so it's live again", async () => {
    state.docs.push({ token: VALID_TOKEN, user_id: 'user_a', platform: 'android', createdAt: 't0', updatedAt: 't0', deleted_at: 't1', account_deleted_at: 't1' })
    await registerPushToken(VALID_TOKEN, 'android', 'user_b')
    expect(state.docs).toHaveLength(1)
    expect(state.docs[0]).toMatchObject({ user_id: 'user_b' })
    expect(state.docs[0].deleted_at).toBeUndefined()
    expect(state.docs[0].account_deleted_at).toBeUndefined()
  })
})
