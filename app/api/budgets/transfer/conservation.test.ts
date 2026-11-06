import { describe, it, expect, vi, beforeEach } from 'vitest'
import { carryFrom } from '@/lib/budgetCarry'
import { computeEnvelopeState, CREDIT_CARD_CATEGORY, INCOME_CATEGORY, shiftMonthKey } from '@/src/lib/envelope'
import type { BudgetRow, CategoryRow, ExpenseRow } from '@/src/types'

/**
 * Move money must never create or destroy money. Each case runs a real move
 * through the route, then recomputes the month the way the clients do
 * (computeEnvelopeState fed the server's carryFrom) and checks that every
 * envelope and Ready to assign moved by exactly the amount asked, and that
 * next month inherits the same total.
 */

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const })),
  readOnlyGuard: vi.fn(() => null),
}))
vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))
vi.mock('@/lib/notifications/instant', () => ({ reconcileThresholdLevels: vi.fn(async () => {}) }))
vi.mock('@/lib/mongodb', () => ({ withTx: async (fn: (session: undefined) => Promise<unknown>) => fn(undefined) }))

type Doc = Record<string, unknown>
let store: Doc[] = []
let expenses: ExpenseRow[] = []
const categories: CategoryRow[] = [
  { name: 'Food', group: '' },
  { name: 'Travel', group: '' },
  { name: 'Rent', group: '' },
]

const rows = (): BudgetRow[] => store.map((d) => ({
  month: String(d.month), category: String(d.category), assigned: String(d.assigned ?? 0),
  rolled_over: String(d.rolled_over ?? 0), extra: String(d.extra ?? 0), landed: String(d.landed ?? 0), version: 0,
}))

vi.mock('@/lib/budgetCarry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/budgetCarry')>()
  return {
    ...actual,
    computeCarry: vi.fn(async (_auth: unknown, month: string) => ({ month, ...actual.carryFrom(rows(), expenses, categories, month) })),
  }
})

const matches = (doc: Doc, filter: Doc) => Object.entries(filter).every(([k, v]) => doc[k] === v)
vi.mock('@/lib/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/http')>()),
  getCollection: vi.fn(async () => ({
    findOne: async (filter: Doc) => store.find((d) => matches(d, filter)) ?? null,
    find: (filter: Doc) => ({ toArray: async () => store.filter((d) => matches(d, filter)) }),
    insertOne: async (doc: Doc) => { store.push({ ...doc }); return {} },
    updateOne: async (filter: Doc, update: { $set: Doc }) => {
      const doc = store.find((d) => matches(d, filter))
      if (doc) Object.assign(doc, update.$set)
      return { matchedCount: doc ? 1 : 0 }
    },
  })),
}))

const { POST } = await import('./route')

const RTA = '__ready_to_assign__'
const MONTH = '2026-12'
const PREV = '2026-11'

function budget(month: string, category: string, assigned: number, extra: Doc = {}): Doc {
  return { _id: `${month}:${category}`, month, category, assigned: String(assigned), rolled_over: '0', version: 0, ...extra }
}
function spend(date: string, category: string, amount: number): ExpenseRow {
  return { timestamp: date, date, item: 'x', amount_inr: String(amount), category, notes: '', source: '', amount: String(amount), description: '', payment_method: '' }
}

/** Envelope balances and Ready to assign for `month`, as a client would show them. */
function snapshot(month = MONTH) {
  const state = computeEnvelopeState(rows(), expenses, month, categories, [], undefined, carryFrom(rows(), expenses, categories, month))
  const out: Record<string, number> = { [RTA]: state.readyToAssign }
  for (const e of state.envelopes) out[e.category] = e.available
  return out
}
/** Everything next month starts with: every envelope's carry plus Ready to assign's. */
function nextMonthTotal() {
  const c = carryFrom(rows(), expenses, categories, shiftMonthKey(MONTH, 1))
  return Math.round((c.ready_to_assign + Object.values(c.rolled_over).reduce((s, n) => s + n, 0)) * 100) / 100
}

/**
 * November: Food overspent by 500, Travel 1,500 under, Rent spent to the rupee.
 * December has a Food and a Rent row; Travel has none, so it carries its 2,000 target.
 */
function seed({ funded }: { funded: boolean }) {
  store = [
    budget(PREV, INCOME_CATEGORY, 0, { landed: '10000' }),
    budget(PREV, 'Food', 3000),
    budget(PREV, 'Travel', 2000),
    budget(PREV, 'Rent', 4000),
    budget(MONTH, INCOME_CATEGORY, 0, funded ? { landed: '10000' } : {}),
    budget(MONTH, 'Food', 3000),
    budget(MONTH, 'Rent', 4000),
  ]
  expenses = [
    spend(`${PREV}-05`, 'Food', 3500),
    spend(`${PREV}-09`, 'Travel', 500),
    spend(`${PREV}-01`, 'Rent', 4000),
    spend(`${MONTH}-03`, 'Food', 250.5),
  ]
}

async function move(to: string, sources: { category: string; amount: number }[]) {
  const res = await POST(new Request('https://example.com/api/budgets/transfer', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ month: MONTH, to, sources }),
  }))
  expect(res.status).toBe(200)
}

const CASES: { name: string; to: string; sources: { category: string; amount: number }[] }[] = [
  { name: 'part of carried money, into an envelope short from last month', to: 'Food', sources: [{ category: 'Travel', amount: 1000 }] },
  { name: 'all the carry and some of the target', to: 'Food', sources: [{ category: 'Travel', amount: 2500 }] },
  { name: 'more than the source holds (an overdraw)', to: 'Food', sources: [{ category: 'Travel', amount: 5000 }] },
  { name: 'from Ready to assign', to: 'Food', sources: [{ category: RTA, amount: 700 }] },
  { name: 'back to Ready to assign', to: RTA, sources: [{ category: 'Rent', amount: 1000 }] },
  { name: 'several sources at once, paise included', to: 'Food', sources: [{ category: 'Travel', amount: 300.25 }, { category: 'Rent', amount: 199.75 }] },
  { name: 'into an envelope with money to spare', to: 'Travel', sources: [{ category: 'Rent', amount: 120.1 }] },
]

describe.each([{ funded: true }, { funded: false }])('Move money conserves money (pay landed: $funded)', ({ funded }) => {
  beforeEach(() => seed({ funded }))

  it.each(CASES)('$name', async ({ to, sources }) => {
    const before = snapshot()
    const totalBefore = nextMonthTotal()
    await move(to, sources)
    const after = snapshot()

    const expected: Record<string, number> = {}
    for (const s of sources) expected[s.category] = (expected[s.category] ?? 0) - s.amount
    expected[to] = (expected[to] ?? 0) + sources.reduce((sum, s) => sum + s.amount, 0)
    for (const key of Object.keys(before)) {
      const delta = Math.round((after[key] - before[key]) * 100) / 100
      expect({ key, delta }).toEqual({ key, delta: Math.round((expected[key] ?? 0) * 100) / 100 })
    }
    expect(nextMonthTotal()).toBe(totalBefore)
  })

  it('a move and its reverse put every balance back', async () => {
    const before = snapshot()
    await move('Food', [{ category: 'Travel', amount: 1800 }])
    await move('Travel', [{ category: 'Food', amount: 1800 }])
    expect(snapshot()).toEqual(before)
  })
})

describe.each([{ funded: true }, { funded: false }])('Move money and the card envelope (pay landed: $funded)', ({ funded }) => {
  // Card spending fills this envelope's `assigned` (lib/createExpense.ts), money
  // that already left another envelope, so that part sits outside Ready to assign.
  // A move in or out has to pass through Ready to assign like any other.
  beforeEach(() => {
    seed({ funded })
    store.push(budget(MONTH, CREDIT_CARD_CATEGORY, 900))
  })

  it.each([
    { name: 'from an envelope into the card envelope', to: CREDIT_CARD_CATEGORY, sources: [{ category: 'Travel', amount: 900 }] },
    { name: 'from Ready to assign into the card envelope', to: CREDIT_CARD_CATEGORY, sources: [{ category: RTA, amount: 400 }] },
    { name: 'from the card envelope back to Ready to assign', to: RTA, sources: [{ category: CREDIT_CARD_CATEGORY, amount: 600 }] },
    { name: 'from the card envelope into another envelope', to: 'Food', sources: [{ category: CREDIT_CARD_CATEGORY, amount: 250 }] },
  ])('$name', async ({ to, sources }) => {
    const before = snapshot()
    const totalBefore = nextMonthTotal()
    await move(to, sources)
    const after = snapshot()
    const amount = sources[0].amount
    for (const key of Object.keys(before)) {
      const expected = key === to ? amount : key === sources[0].category ? -amount : 0
      expect({ key, delta: Math.round((after[key] - before[key]) * 100) / 100 }).toEqual({ key, delta: expected })
    }
    expect(nextMonthTotal()).toBe(totalBefore)
  })
})

describe('Move money and the card envelope before rollover started', () => {
  // Before ROLLOVER_START nothing carries, so the card envelope has no carry to
  // move through, and its `assigned` sits outside Ready to assign. No write
  // there can move card money without creating or losing some.
  it.each([
    { to: CREDIT_CARD_CATEGORY, sources: [{ category: 'Food', amount: 100 }] },
    { to: 'Food', sources: [{ category: CREDIT_CARD_CATEGORY, amount: 100 }] },
  ])('refuses a move to $to and leaves every row alone', async ({ to, sources }) => {
    store = [budget('2026-09', 'Food', 3000), budget('2026-09', CREDIT_CARD_CATEGORY, 900)]
    expenses = []
    const before = JSON.stringify(store)
    const res = await POST(new Request('https://example.com/api/budgets/transfer', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ month: '2026-09', to, sources }),
    }))
    expect(res.status).toBe(400)
    expect(JSON.stringify(store)).toBe(before)
  })
})
