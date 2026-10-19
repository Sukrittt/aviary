import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

// Per-user "now" reads the users collection; these suites fake the clock via `nowIST` instead.
vi.mock('@/lib/userCurrency', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/userCurrency')>()),
  nowForUser: async () => (await import('@/lib/http')).nowIST(),
}))


/**
 * Guards the behaviour `createExpense` inherited when it was lifted out of
 * `app/api/expenses`'s POST handler — the three things `lib/subscriptionExpense.ts`
 * lost when it forked the same logic: `client_id` replay, the Credit Card
 * envelope bump, and a transaction around the two.
 */

vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))
vi.mock('@/lib/categoryMap', () => ({ invalidateCategoryMap: vi.fn() }))

const notifyThresholdCrossed = vi.fn(async () => {})
vi.mock('@/lib/notifications/instant', () => ({
  notifyThresholdCrossed: (...args: unknown[]) => notifyThresholdCrossed(...(args as [])),
}))

// Same shim as app/api/expenses/route.test.ts: run the callback with an
// undefined "session", which the fake collection accepts and ignores.
vi.mock('@/lib/mongodb', () => ({
  withTx: async (fn: (session: undefined) => Promise<unknown>) => fn(undefined),
}))

type Doc = Record<string, unknown> & { _id: ObjectId }

const stores: Record<string, Doc[]> = { expenses: [], budgets: [] }
// Makes the next lookup miss, as if a racing request inserted just after it.
let missNextFindOne = false

function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([k, v]) =>
    k === '_id' && v instanceof ObjectId ? doc._id.equals(v) : doc[k] === v,
  )
}

function fakeCollection(base: string) {
  // `categories` is read by resolveCategoryName; start any incidental
  // collection empty rather than undefined.
  const store = (stores[base] ??= [])
  return {
    find: (filter: Record<string, unknown> = {}) => ({
      toArray: async () => store.filter((d) => matches(d, filter)),
    }),
    findOne: async (filter: Record<string, unknown>) => {
      if (missNextFindOne) { missNextFindOne = false; return null }
      return store.find((d) => matches(d, filter)) ?? null
    },
    insertOne: async (doc: Record<string, unknown>) => {
      // The unique index on client_id.
      if (doc.client_id && store.some((d) => d.client_id === doc.client_id)) throw Object.assign(new Error('E11000'), { code: 11000 })
      const withId = { ...doc, _id: new ObjectId() } as Doc
      store.push(withId)
      return { insertedId: withId._id }
    },
    updateOne: async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      const doc = store.find((d) => matches(d, filter))
      if (doc) Object.assign(doc, update.$set)
      return { matchedCount: doc ? 1 : 0 }
    },
  }
}

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return { ...actual, getCollection: vi.fn(async (base: string) => fakeCollection(base)) }
})

const { createExpense } = await import('./createExpense')

const auth = { userId: 'user_a', readOnly: false, sessionId: null }
const base = { item: 'Rent', amount_inr: '1000', category: 'Housing' }

beforeEach(() => {
  stores.expenses = []
  stores.budgets = []
  notifyThresholdCrossed.mockClear()
})

describe('createExpense', () => {
  it('keeps an import id on the row, and only when one is given', async () => {
    await createExpense(auth, { ...base, source: 'import', import_id: 'imp1', notify: false })
    await createExpense(auth, base)
    expect(stores.expenses[0]).toMatchObject({ source: 'import', import_id: 'imp1' })
    expect(stores.expenses[1]).not.toHaveProperty('import_id')
    expect(notifyThresholdCrossed).toHaveBeenCalledTimes(1)
  })

  it('inserts one expense with the defaults the POST route used to apply inline', async () => {
    const result = await createExpense(auth, base)

    expect(result.duplicate).toBe(false)
    expect(stores.expenses).toHaveLength(1)
    expect(stores.expenses[0]).toMatchObject({
      item: 'Rent',
      amount_inr: '1000',
      category: 'Housing',
      notes: '',
      source: 'manual',
      payment_method: 'bank',
      amount: '',
      description: '',
    })
  })

  it('honours an explicit source and date — the recurring backfill stamps the occurrence, not today', async () => {
    await createExpense(auth, { ...base, source: 'recurring', date: '2026-08-18' })

    expect(stores.expenses[0]).toMatchObject({ source: 'recurring', date: '2026-08-18' })
    expect(stores.expenses[0].timestamp).toMatch(/^2026-08-18T/)
  })

  it('treats a repeated client_id as a replay: no second row, duplicate flagged', async () => {
    const first = await createExpense(auth, { ...base, client_id: 'recur:abc:2026-08-18' })
    const second = await createExpense(auth, { ...base, client_id: 'recur:abc:2026-08-18' })

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.id).toBe(first.id)
    expect(stores.expenses).toHaveLength(1)
  })

  it('a replay that loses the insert race gets the winner back as a duplicate, not a 500', async () => {
    const first = await createExpense(auth, { ...base, client_id: 'c1' })
    missNextFindOne = true
    const second = await createExpense(auth, { ...base, client_id: 'c1' })

    expect(second).toMatchObject({ id: first.id, version: 0, duplicate: true })
    expect(stores.expenses).toHaveLength(1)
  })

  it('bumps the __credit_card__ envelope for a credit_card expense', async () => {
    await createExpense(auth, { ...base, payment_method: 'credit_card', date: '2026-09-07' })

    expect(stores.budgets).toHaveLength(1)
    expect(stores.budgets[0]).toMatchObject({
      month: '2026-09',
      category: '__credit_card__',
      assigned: '1000',
    })
  })

  it('accumulates onto an existing __credit_card__ envelope rather than replacing it', async () => {
    await createExpense(auth, { ...base, payment_method: 'credit_card', date: '2026-09-07' })
    await createExpense(auth, { ...base, amount_inr: '250', payment_method: 'credit_card', date: '2026-09-08' })

    expect(stores.budgets).toHaveLength(1)
    expect(stores.budgets[0].assigned).toBe('1250')
  })

  it('keeps the __credit_card__ envelope to the cent as float amounts add up', async () => {
    for (const [i, amount] of ['0.1', '0.2', '1108.24'].entries()) {
      await createExpense(auth, { ...base, amount_inr: amount, payment_method: 'credit_card', date: `2026-09-1${i}` })
    }
    expect(stores.budgets[0].assigned).toBe('1108.54')
  })

  it('leaves the envelope alone for a bank expense', async () => {
    await createExpense(auth, base)
    expect(stores.budgets).toHaveLength(0)
  })

  it('runs the threshold check by default and skips it when notify is false', async () => {
    await createExpense(auth, base)
    expect(notifyThresholdCrossed).toHaveBeenCalledTimes(1)

    await createExpense(auth, { ...base, notify: false })
    expect(notifyThresholdCrossed).toHaveBeenCalledTimes(1)
  })
})
