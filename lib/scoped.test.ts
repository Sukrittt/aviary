import { describe, it, expect, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { scoped } from './scoped'
import { isEncrypted } from './crypto'

type Call = { method: string; args: unknown[] }

/** Fake Mongo collection that records every call it's handed. */
function spy(collectionName = '') {
  const calls: Call[] = []
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args })
      return method === 'find' || method === 'aggregate' ? { toArray: async () => [], map: () => ({ toArray: async () => [] }) } : Promise.resolve({})
    }
  return {
    calls,
    collectionName,
    find: record('find'),
    findOne: record('findOne'),
    insertOne: record('insertOne'),
    insertMany: record('insertMany'),
    updateOne: record('updateOne'),
    updateMany: record('updateMany'),
    replaceOne: record('replaceOne'),
    deleteOne: record('deleteOne'),
    deleteMany: record('deleteMany'),
    countDocuments: record('countDocuments'),
    distinct: record('distinct'),
    aggregate: record('aggregate'),
    bulkWrite: record('bulkWrite'),
  }
}

type StoredDoc = Record<string, unknown> & { _id: number }

/** A minimal but real in-memory Mongo collection, for exercising the encryption round-trip end to end. */
function fakeMongoCollection(collectionName: string) {
  const store: StoredDoc[] = []
  let nextId = 1

  function matches(doc: StoredDoc, filter: Record<string, unknown>): boolean {
    // `null` matches a missing field too, mirroring real Mongo equality semantics —
    // needed since `deleted_at: null` is the default "live" filter and old docs
    // predating the field are missing it entirely.
    return Object.entries(filter).every(([k, v]) => (v === null ? doc[k] == null : doc[k] === v))
  }

  function applyUpdate(doc: StoredDoc, update: Record<string, unknown>): void {
    if (update.$set) Object.assign(doc, update.$set as Record<string, unknown>)
    if (update.$setOnInsert) Object.assign(doc, update.$setOnInsert as Record<string, unknown>)
    if (update.$push) {
      for (const [key, raw] of Object.entries(update.$push as Record<string, unknown>)) {
        const existing = Array.isArray(doc[key]) ? (doc[key] as unknown[]) : []
        const each = raw && typeof raw === 'object' && '$each' in (raw as object) ? (raw as { $each: unknown[] }).$each : [raw]
        const slice = raw && typeof raw === 'object' && '$slice' in (raw as object) ? (raw as { $slice: number }).$slice : undefined
        let next = [...existing, ...each]
        if (typeof slice === 'number' && slice < 0) next = next.slice(slice)
        doc[key] = next
      }
    }
  }

  return {
    collectionName,
    store,
    find(filter: Record<string, unknown> = {}) {
      const results = store.filter((d) => matches(d, filter))
      return {
        sort: () => ({ toArray: async () => results }),
        map<U>(fn: (d: StoredDoc) => U) {
          return { toArray: async () => results.map(fn) }
        },
        toArray: async () => results,
      }
    },
    async findOne(filter: Record<string, unknown> = {}) {
      return store.find((d) => matches(d, filter)) ?? null
    },
    async insertOne(doc: Record<string, unknown>) {
      const withId = { ...doc, _id: nextId++ } as StoredDoc
      store.push(withId)
      return { insertedId: withId._id }
    },
    async insertMany(docs: Record<string, unknown>[]) {
      const ids = docs.map((doc) => {
        const withId = { ...doc, _id: nextId++ } as StoredDoc
        store.push(withId)
        return withId._id
      })
      return { insertedIds: ids }
    },
    async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, options?: { upsert?: boolean }) {
      const doc = store.find((d) => matches(d, filter))
      if (doc) {
        applyUpdate(doc, update)
        return { matchedCount: 1 }
      }
      if (options?.upsert) {
        const created = { ...filter, _id: nextId++ } as StoredDoc
        applyUpdate(created, update)
        store.push(created)
        return { matchedCount: 0, upsertedId: created._id }
      }
      return { matchedCount: 0 }
    },
    async deleteOne(filter: Record<string, unknown>) {
      const index = store.findIndex((d) => matches(d, filter))
      if (index === -1) return { acknowledged: true, deletedCount: 0 }
      store.splice(index, 1)
      return { acknowledged: true, deletedCount: 1 }
    },
    async distinct(key: string, filter: Record<string, unknown> = {}) {
      const results = store.filter((d) => matches(d, filter))
      return [...new Set(results.map((d) => d[key]))]
    },
    aggregate<T>(pipeline: Record<string, unknown>[]) {
      const matchStage = pipeline[0]?.$match as Record<string, unknown> | undefined
      const results = matchStage ? store.filter((d) => matches(d, matchStage)) : [...store]
      return {
        map(fn: (d: StoredDoc) => T) {
          return { toArray: async () => results.map(fn) }
        },
        toArray: async () => results as unknown as T[],
      }
    },
  }
}

describe('scoped()', () => {
  it('injects user_id into every filter and stamps it on every insert', () => {
    const s = spy()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = scoped(s as any, 'user_alice')

    c.find({ date: '2026-01-01' })
    c.findOne({ name: 'Rent' })
    c.updateOne({ month: '2026-01' }, { $set: { assigned: '1' } })
    c.deleteOne({ name: 'Gone' })
    c.countDocuments({})
    c.insertOne({ item: 'Coffee' })
    c.bulkWrite([{ updateOne: { filter: { name: 'A' }, update: { $set: { order: 1 } } } }])

    expect(s.calls.length).toBe(7)
    for (const { method, args } of s.calls) {
      if (method === 'insertOne') {
        expect((args[0] as Record<string, unknown>).user_id).toBe('user_alice')
      } else if (method === 'bulkWrite') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((args[0] as any[])[0].updateOne.filter.user_id).toBe('user_alice')
      } else {
        expect((args[0] as Record<string, unknown>).user_id).toBe('user_alice')
      }
    }
  })

  it('does not let a caller-supplied user_id override the scope', () => {
    const s = spy()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scoped(s as any, 'user_alice').find({ user_id: 'user_bob' })
    expect((s.calls[0].args[0] as Record<string, unknown>).user_id).toBe('user_alice')
  })

  it('insertMany stamps user_id on every document', () => {
    const s = spy()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scoped(s as any, 'user_alice').insertMany([{ item: 'A' }, { item: 'B' }])
    const docs = s.calls[0].args[0] as Record<string, unknown>[]
    expect(docs.every((d) => d.user_id === 'user_alice')).toBe(true)
  })

  it('bulkWrite scopes every operation kind', () => {
    const s = spy()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scoped(s as any, 'user_alice').bulkWrite([
      { insertOne: { document: { item: 'A' } } },
      { updateMany: { filter: { x: 1 }, update: { $set: { y: 1 } } } },
      { deleteMany: { filter: { x: 1 } } },
      { replaceOne: { filter: { x: 1 }, replacement: { item: 'B' } } },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops = s.calls[0].args[0] as any[]
    expect(ops[0].insertOne.document.user_id).toBe('user_alice')
    expect(ops[1].updateMany.filter.user_id).toBe('user_alice')
    expect(ops[2].deleteMany.filter.user_id).toBe('user_alice')
    expect(ops[3].replaceOne.filter.user_id).toBe('user_alice')
    expect(ops[3].replaceOne.replacement.user_id).toBe('user_alice')
  })

  it('aggregate forces a user_id $match as the first stage', () => {
    const s = spy()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scoped(s as any, 'user_alice').aggregate([{ $group: { _id: '$category' } }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline = s.calls[0].args[0] as any[]
    expect(pipeline[0]).toEqual({ $match: { user_id: 'user_alice', deleted_at: null } })
  })
})

describe('scoped() soft delete', () => {
  it('deleteOne stamps deleted_at instead of removing the document, and deletedCount reflects the match', async () => {
    const coll = fakeMongoCollection('categories')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = scoped(coll as any, 'user_alice')
    await view.insertOne({ name: 'Groceries' })

    const result = await view.deleteOne({ name: 'Groceries' })
    expect(result.deletedCount).toBe(1)
    expect(coll.store).toHaveLength(1) // still there, just archived
    expect(coll.store[0].deleted_at).not.toBeNull()

    expect(await view.findOne({ name: 'Groceries' })).toBeNull() // hidden from the live view
  })

  it('restore clears deleted_at, making the document live again', async () => {
    const coll = fakeMongoCollection('categories')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = scoped(coll as any, 'user_alice')
    await view.insertOne({ name: 'Groceries' })
    await view.deleteOne({ name: 'Groceries' })

    await view.restore({ name: 'Groceries' })
    expect(coll.store[0].deleted_at).toBeNull()
    expect((await view.findOne({ name: 'Groceries' }))?.name).toBe('Groceries')
  })

  it('purge removes an archived document for real', async () => {
    const coll = fakeMongoCollection('categories')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = scoped(coll as any, 'user_alice')
    await view.insertOne({ name: 'Groceries' })
    await view.deleteOne({ name: 'Groceries' })

    await view.purge({ name: 'Groceries' })
    expect(coll.store).toHaveLength(0)
  })

  it('a soft-deleted document does not block creating a new live one with the same natural key', async () => {
    const coll = fakeMongoCollection('categories')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = scoped(coll as any, 'user_alice')
    await view.insertOne({ name: 'Groceries' })
    await view.deleteOne({ name: 'Groceries' })

    expect(await view.findOne({ name: 'Groceries' })).toBeNull()
    await view.insertOne({ name: 'Groceries' })
    expect(coll.store.filter((d) => d.name === 'Groceries')).toHaveLength(2)
  })
})

describe('scoped() field encryption', () => {
  beforeEach(() => {
    process.env.FIELD_KEY_V1 = randomBytes(32).toString('base64')
  })

  it('encrypts recurring scan snapshots on update and decrypts them for their owner', async () => {
    const coll = fakeMongoCollection('recurring_detection')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = scoped(coll as any, 'user_alice')
    await view.insertOne({ key: 'snapshot' })
    const snapshot = JSON.stringify({ suggestions: [{ item: 'Rent', amount: 25000 }] })
    await view.updateOne({ key: 'snapshot' }, { $set: { snapshot } })
    expect(isEncrypted(coll.store[0].snapshot)).toBe(true)
    expect((await view.findOne({ key: 'snapshot' }))?.snapshot).toBe(snapshot)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await scoped(coll as any, 'user_bob').findOne({ key: 'snapshot' })).toBeNull()
  })

  it('encrypts declared fields on insertOne, leaves plaintext fields alone', async () => {
    const coll = fakeMongoCollection('expenses')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await scoped(coll as any, 'user_alice').insertOne({
      item: 'Swiggy dinner',
      amount_inr: '450',
      category: 'Food',
      date: '2026-01-15',
    })
    const stored = coll.store[0]
    expect(isEncrypted(stored.item)).toBe(true)
    expect(isEncrypted(stored.amount_inr)).toBe(true)
    expect(stored.category).toBe('Food') // not in ENCRYPTED_FIELDS for expenses
    expect(stored.date).toBe('2026-01-15')
  })

  it('decrypts on find/findOne — round trip through the real collection', async () => {
    const coll = fakeMongoCollection('expenses')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = scoped(coll as any, 'user_alice')
    await view.insertOne({ item: 'Rent', amount_inr: '25000', category: 'Housing' })

    const found = await view.findOne({ category: 'Housing' })
    expect(found?.item).toBe('Rent')
    expect(found?.amount_inr).toBe('25000')

    const rows = await view.find({}).toArray()
    expect(rows[0].item).toBe('Rent')
  })

  it('a document with no encrypted fields declared (e.g. categories) passes through untouched', async () => {
    const coll = fakeMongoCollection('categories')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = scoped(coll as any, 'user_alice')
    await view.insertOne({ name: 'Groceries', group: 'Essentials' })
    expect(coll.store[0].name).toBe('Groceries')
  })

  it('$set on updateOne encrypts the matching field', async () => {
    const coll = fakeMongoCollection('expenses')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = scoped(coll as any, 'user_alice')
    await view.insertOne({ item: 'Coffee', amount_inr: '100', category: 'Food' })
    const id = coll.store[0]._id

    await view.updateOne({ _id: id as never }, { $set: { amount_inr: '150', category: 'Dining' } })
    expect(isEncrypted(coll.store[0].amount_inr)).toBe(true)
    expect(coll.store[0].category).toBe('Dining') // plaintext field, untouched by encryption

    const found = await view.findOne({ _id: id as never })
    expect(found?.amount_inr).toBe('150')
  })

  it('budgets upsert: filter equalities stay plaintext, $set encrypts assigned', async () => {
    const coll = fakeMongoCollection('budgets')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = scoped(coll as any, 'user_alice')
    await view.updateOne(
      { month: '2026-01', category: '__income__' },
      { $set: { assigned: '50000' } },
      { upsert: true },
    )
    const doc = coll.store[0]
    expect(doc.month).toBe('2026-01') // copied from the filter equality, plaintext
    expect(doc.category).toBe('__income__')
    expect(isEncrypted(doc.assigned)).toBe(true)

    const found = await view.findOne({ month: '2026-01', category: '__income__' })
    expect(found?.assigned).toBe('50000')
  })

  it('$push with $each + $slice encrypts only the pushed messages[].text', async () => {
    const coll = fakeMongoCollection('chat_sessions')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = scoped(coll as any, 'user_alice')
    await view.insertOne({ title: 'Money chat', messages: [] })
    const id = coll.store[0]._id
    expect(isEncrypted(coll.store[0].title)).toBe(true)

    await view.updateOne(
      { _id: id as never },
      { $push: { messages: { $each: [{ role: 'user', text: 'How much did I spend?' }], $slice: -100 } } } as never,
    )
    const stored = coll.store[0].messages as Array<{ role: string; text: string }>
    expect(stored).toHaveLength(1)
    expect(stored[0].role).toBe('user') // untouched
    expect(isEncrypted(stored[0].text)).toBe(true)

    const found = await view.findOne({ _id: id as never })
    const foundMessages = found?.messages as Array<{ text: string }>
    expect(foundMessages[0].text).toBe('How much did I spend?')
  })

  it('tolerates a mix of plaintext and encrypted docs on read (mid-rollout safety)', async () => {
    const coll = fakeMongoCollection('expenses')
    coll.store.push({ _id: 1, item: 'Legacy plaintext item', amount_inr: '99', user_id: 'user_alice' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = scoped(coll as any, 'user_alice')
    await view.insertOne({ item: 'New encrypted item', amount_inr: '199' })

    const rows = await view.find({}).toArray()
    expect(rows.map((r) => r.item).sort()).toEqual(['Legacy plaintext item', 'New encrypted item'])
  })

  it('rejects a filter that names an encrypted field', async () => {
    const coll = fakeMongoCollection('expenses')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = scoped(coll as any, 'user_alice')
    expect(() => view.find({ item: 'Coffee' })).toThrow(/encrypted field/)
    await expect(view.findOne({ amount_inr: '100' })).rejects.toThrow(/encrypted field/)
  })

  it('rejects distinct() on an encrypted field', () => {
    const coll = fakeMongoCollection('expenses')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => scoped(coll as any, 'user_alice').distinct('item')).toThrow(/encrypted field/)
  })

  it('allows distinct() on a plaintext field', async () => {
    const coll = fakeMongoCollection('expenses')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await scoped(coll as any, 'user_alice').insertOne({ item: 'x', amount_inr: '1', category: 'Food' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await scoped(coll as any, 'user_alice').distinct('category')
    expect(result).toEqual(['Food'])
  })

  it('rejects $inc on an encrypted field rather than corrupting the ciphertext', () => {
    const coll = fakeMongoCollection('budgets')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = scoped(coll as any, 'user_alice')
    expect(() => view.updateOne({ month: '2026-01' }, { $inc: { assigned: 1 as never } })).toThrow(/\$inc/)
  })

  it('an attacker cannot decrypt one user\'s value by copying it into their own account (AAD binds user_id)', async () => {
    const { encrypt, decrypt } = await import('./crypto')
    const ct = encrypt('secret', 'user_alice:expenses:item')
    expect(() => decrypt(ct, 'user_bob:expenses:item')).toThrow()
  })

  it('findOneRaw returns the stored document without decrypting', async () => {
    const coll = fakeMongoCollection('expenses')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = scoped(coll as any, 'user_alice')
    await view.insertOne({ item: 'Rent', amount_inr: '25000', category: 'Housing' })

    const raw = await view.findOneRaw({ category: 'Housing' })
    expect(isEncrypted(raw?.item)).toBe(true)
    expect(isEncrypted(raw?.amount_inr)).toBe(true)
    expect(raw?.category).toBe('Housing')
  })

  it('findOneRaw stays scoped to user_id and excludes soft-deleted docs', async () => {
    const coll = fakeMongoCollection('expenses')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alice = scoped(coll as any, 'user_alice')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bob = scoped(coll as any, 'user_bob')
    await alice.insertOne({ item: 'Alice item', amount_inr: '1', category: 'Food' })

    expect(await bob.findOneRaw({ category: 'Food' })).toBeNull()

    await alice.deleteOne({ category: 'Food' })
    expect(await alice.findOneRaw({ category: 'Food' })).toBeNull()
  })

  it('bulkWrite insertOne encrypts the document', async () => {
    const coll = fakeMongoCollection('expenses')
    const calls: unknown[] = []
    const bulkColl = {
      ...coll,
      bulkWrite: async (ops: unknown[]) => {
        calls.push(ops)
        return {}
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await scoped(bulkColl as any, 'user_alice').bulkWrite([{ insertOne: { document: { item: 'Bulk item', amount_inr: '10' } } }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops = calls[0] as any[]
    expect(isEncrypted(ops[0].insertOne.document.item)).toBe(true)
  })
})

describe('untrusted encrypted-field inputs', () => {
  it('round trips literal ciphertext-looking text rather than trusting its prefix', async () => {
    process.env.FIELD_KEY_V1 = randomBytes(32).toString('base64')
    const coll = fakeMongoCollection('expenses')
    const view = scoped(coll as never, 'a')
    await view.insertOne({ item: 'enc:v1:hello', notes: 'enc:unknown:abc' })
    expect(await view.findOne({})).toMatchObject({ item: 'enc:v1:hello', notes: 'enc:unknown:abc' })
    await view.updateOne({}, { $set: { item: 'enc:v1:world' } })
    expect(await view.findOne({})).toMatchObject({ item: 'enc:v1:world' })
  })
  it('encrypts numeric bill prices and returns their numeric API type', async () => {
    const coll = fakeMongoCollection('bill_scans')
    const view = scoped(coll as never, 'a')
    await view.insertOne({ items: [{ name: 'Coffee', price: 123.45 }] })
    const stored = coll.store[0].items as { price: unknown }[]
    expect(isEncrypted(stored[0].price)).toBe(true)
    expect(await view.findOne({})).toMatchObject({ items: [{ name: 'Coffee', price: 123.45 }] })
  })
})
