import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

// Per-user "now" reads the users collection; these suites fake the clock via `nowIST` instead.
vi.mock('@/lib/userCurrency', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/userCurrency')>()),
  nowForUser: async () => (await import('@/lib/http')).nowIST(),
}))


vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null })),
  readOnlyGuard: vi.fn(() => null),
}))

const blobDel = vi.fn(async () => {})
vi.mock('@vercel/blob', () => ({ del: (...a: unknown[]) => blobDel(...(a as [])) }))

vi.mock('@/lib/cache', () => ({
  invalidate: vi.fn(),
}))

vi.mock('@/lib/notifications/instant', () => ({
  notifyThresholdCrossed: vi.fn(async () => {}),
}))

const markManualTransactionCompleteMock = vi.fn(async () => {})
vi.mock('@/lib/users', () => ({
  markManualTransactionComplete: markManualTransactionCompleteMock,
}))

// withTx just runs the callback with an undefined "session" — fakeCollection
// below accepts and ignores an options argument, so this is enough to
// exercise the same code paths without a real Mongo transaction.
vi.mock('@/lib/mongodb', () => ({
  withTx: async (fn: (session: undefined) => Promise<unknown>) => fn(undefined),
}))

type Doc = Record<string, unknown> & { _id: ObjectId }

const stores: Record<string, Doc[]> = { expenses: [], budgets: [] }

/**
 * Matches a filter against a doc, comparing `_id` by value (ObjectId has no
 * useful `===`) and supporting the `$gte`/`$lte` range operators the
 * paginated GET branch uses for its `from`/`to` date filter.
 */
function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([k, v]) => {
    if (k === '_id' && v instanceof ObjectId) return doc._id.equals(v)
    if (v && typeof v === 'object' && !(v instanceof ObjectId)) {
      return Object.entries(v as Record<string, unknown>).every(([op, opVal]) => {
        if (op === '$exists') return (doc[k] !== undefined) === opVal
        if (op === '$gte') return String(doc[k] ?? '') >= (opVal as string)
        if (op === '$lte') return String(doc[k] ?? '') <= (opVal as string)
        return true
      })
    }
    return doc[k] === v
  })
}

function fakeCollection(base: string) {
  // Any collection the handlers touch incidentally (e.g. `categories`, read by
  // resolveCategoryName) starts empty rather than undefined.
  const store = (stores[base] ??= [])
  return {
    find: (filter: Record<string, unknown> = {}, opts?: { projection?: Record<string, number> }) => {
      let rows = store.filter((d) => matches(d, filter))
      const cursor = {
        sort: () => cursor,
        skip: (n: number) => {
          rows = rows.slice(n)
          return cursor
        },
        limit: (n: number) => {
          rows = rows.slice(0, n)
          return cursor
        },
        batchSize: () => cursor,
        close: async () => {},
        async *[Symbol.asyncIterator]() { yield* rows },
        toArray: async () => {
          if (opts?.projection?.amount_inr) throw new Error('Totals must not buffer the whole history')
          return rows
        },
      }
      return cursor
    },
    // Only the one pipeline the route runs: latest `date` per `category`.
    aggregate: () => ({
      toArray: async () => {
        const last = new Map<string, string>()
        for (const d of store) {
          const cat = String(d.category)
          if (String(d.date) > (last.get(cat) ?? '')) last.set(cat, String(d.date))
        }
        return [...last].map(([_id, last]) => ({ _id, last }))
      },
    }),
    countDocuments: async (filter: Record<string, unknown> = {}) => store.filter((d) => matches(d, filter)).length,
    findOne: async (filter: Record<string, unknown>) => store.find((d) => matches(d, filter)) ?? null,
    insertOne: async (doc: Record<string, unknown>) => {
      const withId = { ...doc, _id: new ObjectId() } as Doc
      store.push(withId)
      return { insertedId: withId._id }
    },
    updateOne: async (filter: Record<string, unknown>, update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }) => {
      const doc = store.find((d) => matches(d, filter))
      if (doc) {
        Object.assign(doc, update.$set ?? {})
        for (const k of Object.keys(update.$unset ?? {})) delete doc[k]
      }
      return { matchedCount: doc ? 1 : 0 }
    },
    deleteOne: async (filter: Record<string, unknown>) => {
      const idx = store.findIndex((d) => matches(d, filter))
      if (idx >= 0) store.splice(idx, 1)
      return { deletedCount: idx >= 0 ? 1 : 0 }
    },
  }
}

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: vi.fn(async (base: string) => fakeCollection(base)),
  }
})

const { GET, POST, PUT, DELETE } = await import('./route')

function req(method: string, body: Record<string, unknown>): Request {
  // Existing arithmetic tests use a freshly loaded identity/version. Stale and
  // versionless callers are covered separately by the replica-set tests.
  if (method === 'PUT' || method === 'DELETE') {
    const row = stores.expenses.find((d) => body.id ? String(d._id) === body.id : d.timestamp === body.timestamp && d.item === body.item)
    body = { id: row ? String(row._id) : body.id, version: row?.version ?? 0, ...body }
  }
  return new Request('https://example.com/api/expenses', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function budgetFor(month: string) {
  return stores.budgets.find((b) => b.month === month && b.category === '__credit_card__')
}

beforeEach(() => {
  stores.expenses = []
  stores.budgets = []
})

describe('PUT /api/expenses — credit-card envelope rebalance (C1)', () => {
  it('moves the envelope allocation when a CC expense changes month at the same amount', async () => {
    await POST(
      req('POST', {
        item: 'Flight',
        amount_inr: '3000',
        category: 'Travel',
        date: '2026-01-15',
        timestamp: '2026-01-15T10:00:00',
        payment_method: 'credit_card',
      }),
    )
    expect(budgetFor('2026-01')?.assigned).toBe('3000')
    expect(budgetFor('2026-02')).toBeUndefined()

    const res = await PUT(
      req('PUT', {
        timestamp: '2026-01-15T10:00:00',
        item: 'Flight',
        amount_inr: '3000',
        new_date: '2026-02-15',
      }),
    )
    expect(res.status).toBe(200)

    // Before the fix: the old month kept the charge and the new month never
    // got it, because the rebalance was gated on amount changing too.
    expect(budgetFor('2026-01')?.assigned).toBe('0')
    expect(budgetFor('2026-02')?.assigned).toBe('3000')
  })

  it('still rebalances correctly when only the amount changes within the same month', async () => {
    await POST(
      req('POST', {
        item: 'Groceries',
        amount_inr: '1000',
        category: 'Food',
        date: '2026-03-05',
        timestamp: '2026-03-05T10:00:00',
        payment_method: 'credit_card',
      }),
    )
    expect(budgetFor('2026-03')?.assigned).toBe('1000')

    await PUT(
      req('PUT', {
        timestamp: '2026-03-05T10:00:00',
        item: 'Groceries',
        amount_inr: '1000',
        new_amount_inr: '1500',
      }),
    )
    expect(budgetFor('2026-03')?.assigned).toBe('1500')
  })

  it('does not touch the credit-card envelope for a non-CC expense edit', async () => {
    await POST(
      req('POST', {
        item: 'Rent',
        amount_inr: '5000',
        category: 'Housing',
        date: '2026-04-01',
        timestamp: '2026-04-01T10:00:00',
        payment_method: 'bank',
      }),
    )
    expect(stores.budgets).toHaveLength(0)

    await PUT(
      req('PUT', {
        timestamp: '2026-04-01T10:00:00',
        item: 'Rent',
        amount_inr: '5000',
        new_date: '2026-05-01',
      }),
    )
    expect(stores.budgets).toHaveLength(0)
  })

  it('updates notes and payment method, unwinding and reapplying the CC envelope on a bank<->credit_card switch', async () => {
    await POST(
      req('POST', {
        item: 'Taxi',
        amount_inr: '400',
        category: 'Transport',
        date: '2026-07-01',
        timestamp: '2026-07-01T10:00:00',
        payment_method: 'bank',
      }),
    )
    expect(stores.budgets).toHaveLength(0)

    // Switch to credit_card: envelope should pick it up.
    let res = await PUT(
      req('PUT', {
        timestamp: '2026-07-01T10:00:00',
        item: 'Taxi',
        amount_inr: '400',
        new_notes: 'Airport run',
        new_payment_method: 'credit_card',
      }),
    )
    expect(res.status).toBe(200)
    expect(stores.expenses[0].notes).toBe('Airport run')
    expect(stores.expenses[0].payment_method).toBe('credit_card')
    expect(budgetFor('2026-07')?.assigned).toBe('400')

    // Switch back to bank: envelope should unwind.
    res = await PUT(
      req('PUT', {
        timestamp: '2026-07-01T10:00:00',
        item: 'Taxi',
        amount_inr: '400',
        new_payment_method: 'bank',
      }),
    )
    expect(res.status).toBe(200)
    expect(budgetFor('2026-07')?.assigned).toBe('0')
  })
})

describe('GET/PUT/DELETE /api/expenses — id-based addressing (C2)', () => {
  it('GET includes a real id alongside the CSV-shaped fields', async () => {
    await POST(
      req('POST', { item: 'Coffee', amount_inr: '150', category: 'Food', date: '2026-06-01' }),
    )
    const res = await GET(new Request('https://example.com/api/expenses'))
    const body = (await res.json()) as { rows: Array<{ id: string; item: string }> }
    expect(body.rows).toHaveLength(1)
    expect(ObjectId.isValid(body.rows[0].id)).toBe(true)
    expect(body.rows[0].item).toBe('Coffee')
  })

  it('PUT updates by id even when two rows share the same timestamp/item/amount', async () => {
    await POST(req('POST', { item: 'Coffee', amount_inr: '150', category: 'Food', timestamp: '2026-06-01T12:00:00Z', date: '2026-06-01' }))
    await POST(req('POST', { item: 'Coffee', amount_inr: '150', category: 'Food', timestamp: '2026-06-01T12:00:00Z', date: '2026-06-01' }))
    const [first, second] = stores.expenses

    const res = await PUT(req('PUT', { id: second._id.toString(), category: 'Dining' }))
    expect(res.status).toBe(200)
    expect(first.category).toBe('Food')
    expect(second.category).toBe('Dining')
  })

  it('DELETE by id removes exactly that row', async () => {
    await POST(req('POST', { item: 'Coffee', amount_inr: '150', category: 'Food', date: '2026-06-01' }))
    const [row] = stores.expenses

    const res = await DELETE(req('DELETE', { id: row._id.toString() }))
    expect(res.status).toBe(200)
    expect(stores.expenses).toHaveLength(0)
  })

  it('requires a version for old clients instead of accepting an unsafe fallback', async () => {
    const res = await PUT(new Request('https://example.com/api/expenses', {
      method: 'PUT', body: JSON.stringify({ timestamp: 'ts-1', item: 'Coffee', amount_inr: '150', category: 'Dining' }),
    }))
    expect(res.status).toBe(428)
  })

  it('rejects a malformed id instead of throwing', async () => {
    const res = await PUT(req('PUT', { id: 'not-an-object-id', category: 'X' }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/expenses — client_id idempotency (offline sync §5)', () => {
  it('records the manual-entry milestone, but not an ordinary or scanned create', async () => {
    await POST(req('POST', { item: 'Coffee', amount_inr: '150', category: 'Food', source: 'manual' }))
    await POST(req('POST', { item: 'Tea', amount_inr: '50', category: 'Food' }))
    await POST(req('POST', { item: 'Receipt item', amount_inr: '100', category: 'Food', source: 'scan' }))

    expect(markManualTransactionCompleteMock).toHaveBeenCalledTimes(1)
    expect(markManualTransactionCompleteMock).toHaveBeenCalledWith('user_a')
  })

  it('a repeated client_id returns the same id, inserts nothing, and leaves the CC envelope unchanged', async () => {
    const body = {
      item: 'Flight',
      amount_inr: '3000',
      category: 'Travel',
      date: '2026-01-15',
      timestamp: '2026-01-15T10:00:00',
      payment_method: 'credit_card',
      client_id: 'client-uuid-1',
    }
    const first = await POST(req('POST', body))
    const firstJson = (await first.json()) as { id: string }
    expect(stores.expenses).toHaveLength(1)
    expect(budgetFor('2026-01')?.assigned).toBe('3000')

    const second = await POST(req('POST', body))
    const secondJson = (await second.json()) as { id: string; duplicate?: boolean }

    expect(second.status).toBe(200)
    expect(secondJson.id).toBe(firstJson.id)
    expect(secondJson.duplicate).toBe(true)
    expect(stores.expenses).toHaveLength(1)
    expect(budgetFor('2026-01')?.assigned).toBe('3000')
  })

  it('the duplicate path does not call notifyThresholdCrossed', async () => {
    const { notifyThresholdCrossed } = await import('@/lib/notifications/instant')
    const body = { item: 'Coffee', amount_inr: '150', category: 'Food', date: '2026-06-01', client_id: 'client-uuid-2' }

    await POST(req('POST', body))
    vi.mocked(notifyThresholdCrossed).mockClear()
    await POST(req('POST', body))

    expect(notifyThresholdCrossed).not.toHaveBeenCalled()
  })

  it('POST without a client_id still works unchanged (web clients)', async () => {
    const res = await POST(req('POST', { item: 'Tea', amount_inr: '50', category: 'Food', date: '2026-06-02' }))
    expect(res.status).toBe(200)
    expect(stores.expenses).toHaveLength(1)
    expect(stores.expenses[0].client_id).toBeUndefined()
  })

  it('a body timestamp is preserved, not overwritten by nowIST()', async () => {
    await POST(
      req('POST', {
        item: 'Snack',
        amount_inr: '20',
        category: 'Food',
        date: '2026-01-01',
        timestamp: '2026-01-01T09:00:00',
      }),
    )
    expect(stores.expenses[0].timestamp).toBe('2026-01-01T09:00:00')
  })
})

describe('POST /api/expenses — source', () => {
  it('records a row confirmed from the money brain as text', async () => {
    const res = await POST(req('POST', { item: 'Auto', amount_inr: '240', category: 'Travel', date: '2026-09-26', source: 'text' }))
    expect(res.status).toBe(200)
    expect(stores.expenses[0].source).toBe('text')
  })

  it('records an estimate confirmed after a balance check as balance_gap', async () => {
    await POST(req('POST', { item: 'Unlogged spends', amount_inr: '2000', category: 'Food', date: '2026-09-27', source: 'balance_gap' }))
    expect(stores.expenses[0].source).toBe('balance_gap')
  })

  it('defaults to manual', async () => {
    await POST(req('POST', { item: 'Tea', amount_inr: '50', category: 'Food', date: '2026-06-02' }))
    expect(stores.expenses[0].source).toBe('manual')
  })

  it('refuses a source only a server job may set', async () => {
    const res = await POST(req('POST', { item: 'Rent', amount_inr: '20000', category: 'Rent', date: '2026-06-01', source: 'recurring' }))
    expect(res.status).toBe(400)
    expect(stores.expenses).toHaveLength(0)
  })
})

describe('GET /api/expenses — server-side pagination (opt-in via ?page=)', () => {
  it('with no ?page= keeps the legacy full-list shape', async () => {
    await POST(req('POST', { item: 'Coffee', amount_inr: '150', category: 'Food', date: '2026-06-01' }))
    await POST(req('POST', { item: 'Tea', amount_inr: '50', category: 'Food', date: '2026-06-02' }))

    const res = await GET(new Request('https://example.com/api/expenses'))
    const body = (await res.json()) as { headers: string[]; rows: unknown[]; total?: number }
    expect(body.rows).toHaveLength(2)
    expect(body.total).toBeUndefined()
  })

  it('?from= returns only rows on/after it, plus each category\'s all-time last spend date', async () => {
    await POST(req('POST', { item: 'Rent', amount_inr: '5000', category: 'Housing', date: '2026-01-05' }))
    await POST(req('POST', { item: 'Old coffee', amount_inr: '100', category: 'Food', date: '2026-02-01' }))
    await POST(req('POST', { item: 'Coffee', amount_inr: '150', category: 'Food', date: '2026-06-01' }))

    const res = await GET(new Request('https://example.com/api/expenses?from=2026-05-01'))
    const body = (await res.json()) as { rows: Array<{ item: string }>; lastSpent: Record<string, string>; total?: number }
    expect(body.rows.map((r) => r.item)).toEqual(['Coffee'])
    expect(body.lastSpent).toEqual({ Housing: '2026-01-05', Food: '2026-06-01' })
    expect(body.total).toBeUndefined()
  })

  it('?page=&limit= returns a page, a matching total, and pageCount', async () => {
    for (let i = 0; i < 3; i++) {
      await POST(req('POST', { item: `Item ${i}`, amount_inr: '100', category: 'Food', date: '2026-06-01' }))
    }

    const res = await GET(new Request('https://example.com/api/expenses?page=1&limit=2'))
    const body = (await res.json()) as {
      rows: Array<{ item: string }>
      total: number
      page: number
      pageCount: number
      totalAmount: number
    }
    expect(body.rows).toHaveLength(2)
    expect(body.total).toBe(3)
    expect(body.page).toBe(1)
    expect(body.pageCount).toBe(2)
    expect(body.totalAmount).toBe(300)

    const res2 = await GET(new Request('https://example.com/api/expenses?page=2&limit=2'))
    const body2 = (await res2.json()) as { rows: unknown[] }
    expect(body2.rows).toHaveLength(1)
  })

  it('filters by category and date range in the paginated branch', async () => {
    await POST(req('POST', { item: 'Rent', amount_inr: '5000', category: 'Housing', date: '2026-01-01' }))
    await POST(req('POST', { item: 'Coffee', amount_inr: '150', category: 'Food', date: '2026-06-01' }))
    await POST(req('POST', { item: 'Tea', amount_inr: '50', category: 'Food', date: '2026-07-01' }))

    const res = await GET(
      new Request('https://example.com/api/expenses?page=1&limit=10&category=Food&from=2026-06-01&to=2026-06-30'),
    )
    const body = (await res.json()) as { rows: Array<{ item: string }>; total: number }
    expect(body.total).toBe(1)
    expect(body.rows[0].item).toBe('Coffee')
  })

  it('q searches item/notes in JS (item is an encrypted field, so Mongo cannot $regex it)', async () => {
    await POST(req('POST', { item: 'Grocery run', amount_inr: '400', category: 'Food', date: '2026-06-01' }))
    await POST(req('POST', { item: 'Movie ticket', amount_inr: '300', category: 'Entertainment', date: '2026-06-02' }))

    const res = await GET(new Request('https://example.com/api/expenses?page=1&limit=10&q=grocery'))
    const body = (await res.json()) as { rows: Array<{ item: string }>; total: number }
    expect(body.total).toBe(1)
    expect(body.rows[0].item).toBe('Grocery run')
  })
})

it.each([
  { amount_inr: 'Infinity' }, { amount_inr: 'NaN' }, { amount_inr: '-1' },
  { date: '2026-02-30' }, { date: 'not-a-date' }, { payment_method: 'not-a-method' },
])('rejects invalid expense data before writing: %j', async (invalid) => {
  const res = await POST(req('POST', { item: 'Coffee', amount_inr: '150', category: 'Food', ...invalid }))
  expect(res.status).toBe(400)
})

it('rejects malformed timestamps and non-text update values before writing', async () => {
  expect((await POST(req('POST', { item: 'Coffee', amount_inr: '1', category: 'Food', timestamp: 'junk' }))).status).toBe(400)
  await POST(req('POST', { item: 'Coffee', amount_inr: '1', category: 'Food' }))
  expect((await PUT(req('PUT', { id: String(stores.expenses[0]._id), new_item: { bad: true } }))).status).toBe(400)
})

it('lets an edit correct an amount to zero, matching the transaction editor', async () => {
  await POST(req('POST', { item: 'Coffee', amount_inr: '100', category: 'Food' }))
  const res = await PUT(req('PUT', { id: String(stores.expenses[0]._id), new_amount_inr: '0' }))
  expect(res.status).toBe(200)
})

describe('expense photos', () => {
  it('rows carry has_photo, outside the CSV headers', async () => {
    await POST(req('POST', { item: 'Plant', amount_inr: '300', category: 'Home' }))
    await POST(req('POST', { item: 'Tea', amount_inr: '50', category: 'Food' }))
    stores.expenses[0].photo_file = 'jpg'
    const body = (await (await GET(new Request('https://example.com/api/expenses'))).json()) as {
      headers: string[]
      rows: Array<{ item: string; has_photo: boolean }>
    }
    expect(body.headers).not.toContain('has_photo')
    expect(Object.fromEntries(body.rows.map((r) => [r.item, r.has_photo]))).toEqual({ Plant: true, Tea: false })
  })

  it('DELETE removes the photo blob and clears photo_file, so a restored row claims no photo', async () => {
    blobDel.mockClear()
    await POST(req('POST', { item: 'Plant', amount_inr: '300', category: 'Home' }))
    const row = stores.expenses[0]
    row.photo_file = 'a1.png'
    const res = await DELETE(req('DELETE', { id: String(row._id) }))
    expect(res.status).toBe(200)
    expect(blobDel).toHaveBeenCalledWith(`expense-photos/user_a/${row._id}-a1.png`)
    expect(row.photo_file).toBeUndefined()
  })

  it('DELETE still succeeds when the blob delete fails', async () => {
    blobDel.mockClear().mockRejectedValueOnce(new Error('blob down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await POST(req('POST', { item: 'Plant', amount_inr: '300', category: 'Home' }))
    stores.expenses[0].photo_file = 'jpg'
    const res = await DELETE(req('DELETE', { id: String(stores.expenses[0]._id) }))
    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('DELETE without a photo never touches Blob', async () => {
    blobDel.mockClear()
    await POST(req('POST', { item: 'Tea', amount_inr: '50', category: 'Food' }))
    await DELETE(req('DELETE', { id: String(stores.expenses[0]._id) }))
    expect(blobDel).not.toHaveBeenCalled()
  })
})
