import { describe, it, expect, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'

beforeEach(() => {
  process.env.FIELD_KEY_V1 = randomBytes(32).toString('base64')
})

type RewriteDoc = (doc: Record<string, unknown>, collectionName: string, idMap: Map<string, string>) => Record<string, unknown> | null

async function load() {
  const mod = await import('./migrate-workos-ids.mjs')
  const crypto = await import('../lib/crypto')
  return { rewriteDoc: mod.rewriteDoc as unknown as RewriteDoc, ...crypto }
}

const ids = new Map([['user_OLD', 'user_NEW']])

describe('rewriteDoc (scripts/migrate-workos-ids.mjs)', () => {
  it('moves user_id and re-encrypts fields, including array sub-fields, under the new owner', async () => {
    const { rewriteDoc, encrypt, decrypt } = await load()
    const date = new Date()
    const doc = {
      _id: 'x',
      user_id: 'user_OLD',
      title: encrypt('Trip', 'user_OLD:chat_sessions:title'),
      messages: [{ role: 'user', text: encrypt('hi', 'user_OLD:chat_sessions:messages.text') }],
      updatedAt: date,
    }

    const next = rewriteDoc(doc, 'chat_sessions', ids)!

    expect(next.user_id).toBe('user_NEW')
    expect(decrypt(next.title, 'user_NEW:chat_sessions:title')).toBe('Trip')
    const msg = (next.messages as { text: string }[])[0]
    expect(decrypt(msg.text, 'user_NEW:chat_sessions:messages.text')).toBe('hi')
    expect(next.updatedAt).toBe(date)
  })

  it('rewrites _id, camelCase userId, and ids embedded in strings', async () => {
    const { rewriteDoc } = await load()
    expect(rewriteDoc({ _id: 'user_OLD', plan: 'pro' }, 'billing_accounts', ids)).toEqual({ _id: 'user_NEW', plan: 'pro' })
    expect(rewriteDoc({ _id: 1, userId: 'user_OLD' }, 'billing_events', ids)).toEqual({ _id: 1, userId: 'user_NEW' })
    expect(rewriteDoc({ _id: 1, key: 'chat:user_OLD:2026' }, 'rate_limit_hits', ids)).toEqual({ _id: 1, key: 'chat:user_NEW:2026' })
  })

  it('returns null for documents of other users', async () => {
    const { rewriteDoc } = await load()
    expect(rewriteDoc({ _id: 1, user_id: 'demo', item: 'x' }, 'expenses', ids)).toBeNull()
  })

  it('throws instead of writing when a value will not decrypt', async () => {
    const { rewriteDoc, encrypt } = await load()
    const doc = { _id: 1, user_id: 'user_OLD', item: encrypt('Coffee', 'someone_else:expenses:item') }
    expect(() => rewriteDoc(doc, 'expenses', ids)).toThrow()
  })
})
