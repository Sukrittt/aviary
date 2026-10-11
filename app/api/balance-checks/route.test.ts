import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

type Doc = Record<string, unknown>
const stores: Record<string, Doc[]> = { balance_checks: [], expenses: [], accounts: [] }
const addIncome = vi.fn(async (..._args: unknown[]) => ({ id: 'inc', version: 0, duplicate: false }))
vi.mock('@/lib/income', () => ({ addIncome: (...args: unknown[]) => addIncome(...args) }))
let now = { date: '2026-09-27', timestamp: '2026-09-27T10:00:00+05:30' }
let auth = { userId: 'user_a', readOnly: false, sessionId: null as string | null }

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => auth),
  readOnlyGuard: (a: { readOnly: boolean }, method: string) =>
    a.readOnly && method !== 'GET' ? Response.json({ error: 'read-only in demo mode' }, { status: 403 }) : null,
}))
vi.mock('@/lib/userCurrency', () => ({ nowForUser: vi.fn(async () => now) }))

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([k, v]) => {
    if (k === '_id') return String(doc._id) === String(v)
    if (v && typeof v === 'object' && '$gte' in (v as Doc)) return String(doc[k]) >= String((v as Doc).$gte)
    if (v && typeof v === 'object' && '$ne' in (v as Doc)) return doc[k] !== (v as Doc).$ne
    return doc[k] === v
  })
}

function fake(name: string) {
  const store = () => stores[name]
  return {
    find: (filter: Doc = {}) => {
      let rows = store().filter((d) => matches(d, filter))
      const cursor = {
        sort: (spec: Record<string, number>) => {
          const [[key, dir]] = Object.entries(spec)
          rows = [...rows].sort((a, b) => (String(a[key]) < String(b[key]) ? -dir : dir))
          return cursor
        },
        limit: (n: number) => {
          rows = rows.slice(0, n)
          return cursor
        },
        toArray: async () => rows,
      }
      return cursor
    },
    findOne: async (filter: Doc) => store().find((d) => matches(d, filter)) ?? null,
    insertOne: async (doc: Doc) => {
      const _id = new ObjectId()
      store().push({ ...doc, _id })
      return { insertedId: _id }
    },
    replaceOne: async (filter: Doc, doc: Doc) => {
      const i = store().findIndex((d) => matches(d, filter))
      store()[i] = { ...doc, _id: store()[i]._id }
      return { matchedCount: 1 }
    },
    updateOne: async (filter: Doc, update: { $set: Doc }) => {
      const doc = store().find((d) => matches(d, filter))
      if (doc) Object.assign(doc, update.$set)
      return { matchedCount: doc ? 1 : 0 }
    },
  }
}

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return { ...actual, getCollection: vi.fn(async (name: string) => fake(name)) }
})

const { GET, POST } = await import('./route')
const { POST: RESOLVE } = await import('./[id]/resolve/route')

function post(body: unknown) {
  return POST(new Request('https://example.com/api/balance-checks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
}

function resolve(id: string, body: unknown) {
  return RESOLVE(
    new Request(`https://example.com/api/balance-checks/${id}/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  )
}

const expense = (date: string, time: string, amount: number, category = 'Food', payment_method = 'bank', source = 'manual') => ({
  _id: new ObjectId(),
  date,
  timestamp: `${date}T${time}+05:30`,
  amount_inr: String(amount),
  category,
  payment_method,
  source,
})

/** A starting point a week ago, and a typical week of everyday spends before it. */
function seedBaseline(balance = 50000) {
  stores.balance_checks.push({ _id: new ObjectId(), timestamp: '2026-09-20T10:00:00+05:30', date: '2026-09-20', status: 'baseline', kind: 'baseline', balance: String(balance) })
  for (let d = 1; d <= 12; d++) stores.expenses.push(expense(`2026-09-${String(d).padStart(2, '0')}`, '12:00:00', 300, d % 3 ? 'Food' : 'Travel'))
}

beforeEach(() => {
  addIncome.mockClear()
  stores.accounts = []
  stores.balance_checks = []
  stores.expenses = []
  now = { date: '2026-09-27', timestamp: '2026-09-27T10:00:00+05:30' }
  auth = { userId: 'user_a', readOnly: false, sessionId: null }
})

describe('POST /api/balance-checks', () => {
  it('makes the first check the starting point', async () => {
    const body = await (await post({ balance: 50000 })).json()
    expect(body.kind).toBe('baseline')
    expect(stores.balance_checks[0]).toMatchObject({ status: 'baseline', balance: '50000' })
  })

  it('calls it square when the drop matches what was logged', async () => {
    seedBaseline()
    stores.expenses.push(expense('2026-09-22', '13:00:00', 2000))
    const body = await (await post({ balance: 48000 })).json()
    expect(body).toMatchObject({ kind: 'square', expected: 48000, logged: 2000, gap: 0, loggedPct: 100 })
  })

  it('finds money that left without being logged, leaving card and cash spends out', async () => {
    seedBaseline()
    stores.expenses.push(expense('2026-09-22', '13:00:00', 2000))
    stores.expenses.push(expense('2026-09-23', '13:00:00', 5000, 'Shopping', 'credit_card'))
    stores.expenses.push(expense('2026-09-24', '13:00:00', 100, 'Food', 'cash'))
    const body = await (await post({ balance: 44600 })).json()
    expect(body).toMatchObject({ kind: 'unlogged', expected: 48000, logged: 2000, gap: 3400, cardSpendRecent: 5000 })
    expect(stores.balance_checks[1].status).toBe('open')
  })

  it('spots more money than expected', async () => {
    seedBaseline()
    expect((await (await post({ balance: 55000 })).json()).kind).toBe('surplus')
  })

  it('replaces an open check, measuring from the settled one', async () => {
    seedBaseline()
    await post({ balance: 40000 })
    const body = await (await post({ balance: 49900 })).json()
    expect(body.kind).toBe('square')
    expect(stores.balance_checks).toHaveLength(2)
  })

  it('totals the accounts it was given and remembers their names', async () => {
    seedBaseline()
    Object.assign(stores.balance_checks[0], { accounts: [{ name: 'HDFC', balance: '42000' }, { name: 'Slice', balance: '8000' }] })
    stores.expenses.push(expense('2026-09-22', '13:00:00', 2000))
    const body = await (await post({ accounts: [{ name: 'HDFC', balance: 40000 }, { name: 'Slice', balance: 8000 }] })).json()
    expect(body).toMatchObject({ kind: 'square', balance: 48000, gap: 0 })
    expect(stores.balance_checks[1]).toMatchObject({
      balance: '48000',
      accounts: [{ name: 'HDFC', balance: '40000' }, { name: 'Slice', balance: '8000' }],
    })
    const got = await (await GET(new Request('https://example.com/api/balance-checks'))).json()
    expect(got.accounts).toEqual(['HDFC', 'Slice'])
  })

  it('starts over when an account is added, so its money never reads as income', async () => {
    seedBaseline()
    await post({ accounts: [{ name: 'HDFC', balance: 50000 }] })
    now = { date: '2026-10-04', timestamp: '2026-10-04T10:00:00+05:30' }
    const body = await (await post({ accounts: [{ name: 'HDFC', balance: 50000 }, { name: 'Slice', balance: 9000 }] })).json()
    expect(body).toMatchObject({ kind: 'baseline', reason: 'accounts_changed', balance: 59000 })
    expect(stores.balance_checks.at(-1)).toMatchObject({ status: 'baseline' })
  })

  it('keeps the account names when an older app sends one balance', async () => {
    seedBaseline()
    Object.assign(stores.balance_checks[0], { accounts: [{ name: 'HDFC', balance: '50000' }, { name: 'Slice', balance: '0' }] })
    expect((await (await post({ balance: 50000 })).json()).kind).toBe('baseline')
    const got = await (await GET(new Request('https://example.com/api/balance-checks'))).json()
    expect(got.accounts).toEqual(['HDFC', 'Slice'])
  })

  it('rejects a bad account list', async () => {
    expect((await post({ accounts: [{ name: '', balance: 10 }] })).status).toBe(400)
  })

  it('rejects a balance that is not a number, and the demo account', async () => {
    expect((await post({ balance: 'lots' })).status).toBe(400)
    auth = { ...auth, readOnly: true }
    expect((await post({ balance: 100 })).status).toBe(403)
  })
})

describe('GET /api/balance-checks', () => {
  it('is due with no check yet', async () => {
    const body = await (await GET(new Request('https://example.com/api/balance-checks'))).json()
    expect(body).toMatchObject({ due: true, expected: null, anchor: null, loggedPct: null })
  })

  it("asks about the user's bank accounts once there are some", async () => {
    stores.accounts.push(
      { _id: new ObjectId(), name: 'HDFC', type: 'bank', archived: false, created_at: '1' },
      { _id: new ObjectId(), name: 'Old', type: 'bank', archived: true, created_at: '2' },
      { _id: new ObjectId(), name: 'Wallet', type: 'cash', archived: false, created_at: '3' },
      { _id: new ObjectId(), name: 'Slice', type: 'bank', archived: false, created_at: '4' },
    )
    const body = await (await GET(new Request('https://example.com/api/balance-checks'))).json()
    expect(body.accounts).toEqual(['HDFC', 'Slice'])
  })

  it('prefills the balance it expects and waits a week', async () => {
    seedBaseline()
    stores.expenses.push(expense('2026-09-22', '13:00:00', 2000))
    now = { date: '2026-09-24', timestamp: '2026-09-24T10:00:00+05:30' }
    const body = await (await GET(new Request('https://example.com/api/balance-checks'))).json()
    expect(body).toMatchObject({ due: false, expected: 48000, anchor: { balance: 50000 } })
  })

  it('stays due while a gap is unexplained, and reports the meter once one is resolved', async () => {
    seedBaseline()
    const { id } = await (await post({ balance: 46600 })).json()
    expect((await (await GET(new Request('https://example.com/api/balance-checks'))).json()).due).toBe(true)
    await resolve(id, {})
    const body = await (await GET(new Request('https://example.com/api/balance-checks'))).json()
    expect(body.due).toBe(false)
    expect(body.loggedPct).toBe(0)
  })

  it('never shows the demo account a check', async () => {
    auth = { ...auth, readOnly: true }
    expect((await (await GET(new Request('https://example.com/api/balance-checks'))).json()).due).toBe(false)
  })
})

describe('POST /api/balance-checks/:id/resolve', () => {
  it('turns spends not logged into estimated rows split by habit', async () => {
    seedBaseline()
    stores.expenses.push(expense('2026-09-22', '13:00:00', 2000))
    const { id } = await (await post({ balance: 44600 })).json()

    const body = await (await resolve(id, {})).json()

    expect(body.forgotten).toBe(3400)
    expect(body.loggedPct).toBe(37)
    expect(body.proposal.id).toBe(id)
    expect(body.proposal.items.map((i: { category: string }) => i.category)).toEqual(['Food', 'Travel'])
    expect(body.proposal.items.reduce((s: number, i: { amount: number }) => s + i.amount, 0)).toBe(3400)
    expect(body.proposal.items[0]).toMatchObject({ item: 'Unlogged spends', date: '2026-09-27', paymentMethod: 'bank' })
  })

  it('takes a card bill and moved money out of the gap, and flags card spends the bill says were missed', async () => {
    seedBaseline()
    stores.expenses.push(expense('2026-09-10', '13:00:00', 6000, 'Shopping', 'credit_card'))
    const { id } = await (await post({ balance: 39000 })).json() // gap 11000

    const body = await (await resolve(id, { cardBill: 8000, movedOut: 2500 })).json()

    expect(body.forgotten).toBe(500)
    expect(body.cardShortfall).toBe(2000)
    const card = body.proposal.items.filter((i: { paymentMethod: string }) => i.paymentMethod === 'credit_card')
    expect(card).toEqual([expect.objectContaining({ item: 'Unlogged card spends', category: 'Shopping', amount: 2000 })])
  })

  it('logs nothing when the whole gap was moved or lent', async () => {
    seedBaseline()
    const { id } = await (await post({ balance: 45000 })).json()
    const body = await (await resolve(id, { movedOut: 5000 })).json()
    expect(body).toMatchObject({ forgotten: 0, proposal: null, loggedPct: 100 })
  })

  it('records why there was more money, and puts income in the ledger', async () => {
    seedBaseline()
    const { id, gap } = await (await post({ balance: 102000 })).json()
    const body = await (await resolve(id, { moneyIn: 'income' })).json()
    expect(body).toMatchObject({ status: 'resolved', proposal: null })
    expect(stores.balance_checks[1]).toMatchObject({ status: 'resolved', money_in: 'income' })
    expect(addIncome).toHaveBeenCalledTimes(1)
    expect(addIncome.mock.calls[0][1]).toMatchObject({ amount: -gap, label: 'Money in', source: 'balance_gap', counted: 'extra', client_id: `balance:${id}` })
    expect((await resolve(new ObjectId().toString(), { moneyIn: 'income' })).status).toBe(404)
  })

  it('logs nothing for a refund or money moved in', async () => {
    seedBaseline()
    const { id } = await (await post({ balance: 102000 })).json()
    await resolve(id, { moneyIn: 'refund' })
    expect(addIncome).not.toHaveBeenCalled()
  })

  it('answers a retry with the same rows', async () => {
    seedBaseline()
    const { id } = await (await post({ balance: 46600 })).json()
    const first = await (await resolve(id, {})).json()
    const again = await (await resolve(id, {})).json()
    expect(again.proposal).toEqual(first.proposal)
  })

  it('rejects bad input and checks with nothing to explain', async () => {
    seedBaseline()
    const surplus = await (await post({ balance: 60000 })).json()
    expect((await resolve(surplus.id, { moneyIn: 'lottery' })).status).toBe(400)
    const baselineId = String(stores.balance_checks[0]._id)
    expect((await resolve(baselineId, {})).status).toBe(409)
    expect((await resolve('nope', {})).status).toBe(400)
  })
})
