import { describe, it, expect, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'

beforeEach(() => {
  process.env.FIELD_KEY_V1 = randomBytes(32).toString('base64')
})

// buildUpdate is plain JS (scripts/encrypt-existing.mjs) with no type
// annotations — TS infers an imprecise shape from its usage inside the file,
// so tests cast the import once here rather than fighting that inference.
type BuildUpdate = (doc: Record<string, unknown>, fields: string[], collectionName: string) => Record<string, unknown> | null

async function getBuildUpdate(): Promise<BuildUpdate> {
  const mod = await import('./encrypt-existing.mjs')
  return mod.buildUpdate as unknown as BuildUpdate
}

describe('buildUpdate (scripts/encrypt-existing.mjs)', () => {
  it('encrypts plaintext values in declared fields, ignores fields not in the list', async () => {
    const buildUpdate = await getBuildUpdate()
    const { isEncrypted } = await import('../lib/crypto')
    const fields = ['item', 'amount_inr']

    const set = buildUpdate({ user_id: 'user_a', item: 'Coffee', amount_inr: '150', category: 'Food' }, fields, 'expenses')

    expect(set).not.toBeNull()
    expect(isEncrypted(set!.item)).toBe(true)
    expect(isEncrypted(set!.amount_inr)).toBe(true)
    expect(set!.category).toBeUndefined() // not a declared field — untouched, not even copied into $set
  })

  it('is idempotent — a doc with already-encrypted fields produces no update', async () => {
    const buildUpdate = await getBuildUpdate()
    const { encrypt } = await import('../lib/crypto')
    const fields = ['item']
    const encryptedItem = encrypt('Coffee', 'user_a:expenses:item')

    const set = buildUpdate({ user_id: 'user_a', item: encryptedItem }, fields, 'expenses')
    expect(set).toBeNull()
  })

  it('leaves an empty-string field alone (nothing meaningful to encrypt)', async () => {
    const buildUpdate = await getBuildUpdate()
    const set = buildUpdate({ user_id: 'user_a', notes: '' }, ['notes'], 'expenses')
    expect(set).toBeNull()
  })

  it('encrypts only the unencrypted messages in a chat session, leaving already-encrypted ones alone', async () => {
    const buildUpdate = await getBuildUpdate()
    const { encrypt, isEncrypted } = await import('../lib/crypto')
    const alreadyEncrypted = encrypt('previously migrated', 'user_a:chat_sessions:messages.text')

    const set = buildUpdate(
      {
        user_id: 'user_a',
        messages: [
          { role: 'user', text: alreadyEncrypted },
          { role: 'model', text: 'fresh plaintext reply' },
        ],
      },
      ['messages.text'],
      'chat_sessions',
    )

    expect(set).not.toBeNull()
    const messages = set!.messages as Array<{ text: string }>
    expect(messages[0].text).toBe(alreadyEncrypted) // untouched, not re-encrypted
    expect(isEncrypted(messages[1].text)).toBe(true)
  })

  it('a document that round-trips to no changes across all its fields returns null', async () => {
    const buildUpdate = await getBuildUpdate()
    const { encrypt } = await import('../lib/crypto')
    const fields = ['item', 'amount_inr']
    const doc = {
      user_id: 'user_a',
      item: encrypt('Coffee', 'user_a:expenses:item'),
      amount_inr: encrypt('150', 'user_a:expenses:amount_inr'),
    }
    expect(buildUpdate(doc, fields, 'expenses')).toBeNull()
  })
})

describe('verifyCollection (regression: AAD must match encryption, not the display label)', () => {
  it('verifies a messages[].text value encrypted via buildUpdate, using the real field name as AAD', async () => {
    const mod = await import('./encrypt-existing.mjs')
    const buildUpdate = mod.buildUpdate as (doc: Record<string, unknown>, fields: string[], collectionName: string) => Record<string, unknown> | null
    const verifyCollection = mod.verifyCollection as (
      db: { collection: (name: string) => { find: () => unknown[] } },
      collectionName: string,
      fields: string[],
    ) => Promise<number>

    const doc = { _id: 'sess1', user_id: 'user_a', title: 'Money chat', messages: [{ role: 'user', text: 'How much did I spend?' }] }
    const set = buildUpdate(doc, ['title', 'messages.text'], 'chat_sessions')
    const encryptedDoc = { ...doc, ...set }

    const fakeDb = { collection: () => ({ find: () => [encryptedDoc] }) }
    const failed = await verifyCollection(fakeDb, 'chat_sessions', ['title', 'messages.text'])

    // Before the fix, this failed with 2 (title's AAD field happened to match
    // its label, but messages[].text's AAD field ('messages[].text') didn't
    // match what encryption used ('messages.text') — a real production bug
    // this test would have caught before it ever reached --verify.
    expect(failed).toBe(0)
  })
})

it('backfills nested numeric prices and preserves other already-encrypted item fields', async () => {
  const buildUpdate = await getBuildUpdate()
  const { encrypt, decrypt, isEncrypted } = await import('../lib/crypto')
  const name = encrypt('Coffee', 'user_a:bill_scans:items.name')
  const set = buildUpdate({ user_id: 'user_a', items: [{ name, price: 123.45 }] }, ['items.name', 'items.price'], 'bill_scans')
  const item = (set!.items as { name: string; price: string }[])[0]
  expect(item.name).toBe(name)
  expect(isEncrypted(item.price)).toBe(true)
  expect(decrypt(item.price, 'user_a:bill_scans:items.price')).toBe('123.45')
})
