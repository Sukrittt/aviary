import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MongoMemoryReplSet } from 'mongodb-memory-server'
import { randomBytes } from 'node:crypto'
import { startMongoReplSet } from '@/src/test-utils/mongo'
import { computeEnvelopeState, CREDIT_CARD_CATEGORY, INCOME_CATEGORY } from '@/src/lib/envelope'
import type { BudgetRow, CategoryRow, ExpenseRow } from '@/src/types'
import { getClient, getDb } from '@/lib/mongodb'
import { scoped } from '@/lib/scoped'
import { carryFrom, computeCarry, ROLLOVER_START } from './budgetCarry'

function budget(month: string, category: string, assigned: string, extra?: string, rolled_over = '0'): BudgetRow {
  return { month, category, assigned, rolled_over, ...(extra !== undefined && { extra }), version: 0 }
}

function expense(date: string, category: string, amount_inr: string): ExpenseRow {
  return { timestamp: date, date, item: 'x', amount_inr, category, notes: '', source: '', amount: amount_inr, description: '', payment_method: '' }
}

const categories: CategoryRow[] = [
  { name: 'Travel', group: '' },
  { name: 'Food', group: '' },
]

describe('carryFrom', () => {
  it('starts in 2026-10, so the first carry is October into November', () => {
    expect(ROLLOVER_START).toBe('2026-10')
  })

  it('rolls an envelope\'s unspent money into the same envelope', () => {
    const carry = carryFrom([budget('2026-10', 'Travel', '100')], [expense('2026-10-12', 'Travel', '5')], categories, '2026-11')
    expect(carry.rolled_over.Travel).toBe(95)
  })

  it('rolls an overspend as a negative into the same envelope, not out of Ready to assign', () => {
    const budgets = [budget('2026-10', INCOME_CATEGORY, '1000'), budget('2026-10', 'Food', '300')]
    const carry = carryFrom(budgets, [expense('2026-10-20', 'Food', '320')], categories, '2026-11')
    expect(carry.rolled_over.Food).toBe(-20)
    expect(carry.ready_to_assign).toBe(700)
  })

  it('rolls unassigned money into next month\'s Ready to assign, including a deficit', () => {
    const budgets = [budget('2026-10', INCOME_CATEGORY, '1000'), budget('2026-10', 'Travel', '400')]
    expect(carryFrom(budgets, [], categories, '2026-11').ready_to_assign).toBe(600)
    const over = [budget('2026-10', INCOME_CATEGORY, '100'), budget('2026-10', 'Travel', '400')]
    expect(carryFrom(over, [], categories, '2026-11').ready_to_assign).toBe(-300)
  })

  it('carries one-off income dated the last day of the month', () => {
    // A one-off income on Oct 31 is that month's `extra`, which never carries as
    // income itself but must arrive in November's Ready to assign.
    const budgets = [budget('2026-10', INCOME_CATEGORY, '0', '5000'), budget('2026-10', 'Travel', '0')]
    const carry = carryFrom(budgets, [], categories, '2026-11')
    expect(carry.ready_to_assign).toBe(5000)
    const november = computeEnvelopeState(budgets, [], '2026-11', categories, [], undefined, carry)
    expect(november.readyToAssign).toBe(5000)
  })

  it('picks up a late-logged expense dated in a prior month', () => {
    const budgets = [budget('2026-10', 'Travel', '100')]
    const before = carryFrom(budgets, [expense('2026-10-12', 'Travel', '5')], categories, '2026-11')
    const after = carryFrom(budgets, [expense('2026-10-12', 'Travel', '5'), expense('2026-10-30', 'Travel', '15')], categories, '2026-11')
    expect(before.rolled_over.Travel).toBe(95)
    expect(after.rolled_over.Travel).toBe(80)
  })

  it('rolls the credit-card envelope\'s leftover cash but not its target', () => {
    const budgets = [budget('2026-10', CREDIT_CARD_CATEGORY, '500'), budget('2026-10', 'Travel', '0')]
    const carry = carryFrom(budgets, [expense('2026-10-05', CREDIT_CARD_CATEGORY, '200')], categories, '2026-11')
    expect(carry.rolled_over[CREDIT_CARD_CATEGORY]).toBe(300)
    const november = computeEnvelopeState(budgets, [], '2026-11', categories, [], undefined, carry)
    const cc = november.envelopes.find((e) => e.isCreditCardPayment)!
    expect(cc.assigned).toBe(0)
    expect(cc.available).toBe(300)
    // Still outside totalAssigned, so its cash never moves Ready to assign.
    expect(november.totalAssigned).toBe(0)
  })

  it('ignores every month before the rollover start', () => {
    const budgets = [budget('2026-08', INCOME_CATEGORY, '1000'), budget('2026-09', 'Travel', '100')]
    const expenses = [expense('2026-09-03', 'Travel', '40')]
    expect(carryFrom(budgets, expenses, categories, '2026-10')).toEqual({ ready_to_assign: 0, rolled_over: {} })
    // October still sees the carried target (existing behaviour) but nothing it left behind.
    const november = carryFrom(budgets, expenses, categories, '2026-11')
    expect(november.rolled_over.Travel).toBe(100)
    expect(november.ready_to_assign).toBe(900)
  })

  it('composes with the carried target: 100 target + 95 carried = 195 available', () => {
    const budgets = [budget('2026-10', 'Travel', '100')]
    const expenses = [expense('2026-10-12', 'Travel', '5')]
    const carry = carryFrom(budgets, expenses, categories, '2026-11')
    const travel = computeEnvelopeState(budgets, expenses, '2026-11', categories, [], undefined, carry).envelopes.find((e) => e.category === 'Travel')!
    expect(travel).toMatchObject({ assigned: 100, rolledOver: 95, available: 195 })
  })

  it('compounds over several months', () => {
    const budgets = [budget('2026-10', 'Travel', '100')]
    const expenses = [expense('2026-10-12', 'Travel', '5'), expense('2026-11-02', 'Travel', '50')]
    // Oct leaves 95, Nov adds 100 - 50, so December starts with 145.
    expect(carryFrom(budgets, expenses, categories, '2026-12').rolled_over.Travel).toBe(145)
  })

  it('conserves money: envelopes + Ready to assign = all income minus all spending since the start', () => {
    const budgets = [
      budget('2026-10', INCOME_CATEGORY, '1000', '250.5'),
      budget('2026-10', 'Travel', '100'),
      budget('2026-10', 'Food', '300'),
      budget('2026-11', 'Food', '450'),
      budget('2026-12', INCOME_CATEGORY, '1200', '-75'),
      budget('2026-12', 'Travel', '0'),
    ]
    const expenses = [
      expense('2026-09-30', 'Food', '999'), // before the start: not counted
      expense('2026-10-01', 'Travel', '5'),
      expense('2026-10-31', 'Food', '320'),
      expense('2026-11-15', 'Food', '120.25'),
      expense('2026-12-03', 'Travel', '33.33'),
      expense('2026-12-09', 'Food', '410'),
    ]
    for (const month of ['2026-10', '2026-11', '2026-12', '2027-01']) {
      const carry = carryFrom(budgets, expenses, categories, month)
      const state = computeEnvelopeState(budgets, expenses, month, categories, [], undefined, carry)
      const inEnvelopes = state.envelopes.reduce((sum, e) => sum + e.available, 0)
      let earned = 0
      let spent = 0
      for (let m = ROLLOVER_START; m <= month; m = next(m)) {
        const s = computeEnvelopeState(budgets, expenses, m, categories, [])
        earned += s.income
        spent += s.totalSpent
      }
      expect(round2(inEnvelopes + state.readyToAssign)).toBe(round2(earned - spent))
    }
  })

  it('folds a month\'s one-off rolled_over adjustment into that month\'s carry, out of Ready to assign', () => {
    // Nov: 1000 of Travel's carried 1000 moved back to Ready to assign.
    const budgets = [
      budget('2026-10', INCOME_CATEGORY, '5000'),
      budget('2026-10', 'Travel', '1000'),
      budget('2026-11', 'Travel', '1000', undefined, '-1000'),
    ]
    const nov = carryFrom(budgets, [], categories, '2026-11')
    expect(nov.rolled_over.Travel).toBeUndefined()
    expect(nov.ready_to_assign).toBe(5000)
    // The adjustment is November's alone: December carries Nov's 1000 and nothing else.
    const dec = carryFrom(budgets, [], categories, '2026-12')
    expect(dec.rolled_over.Travel).toBe(1000)
    expect(carryFrom(budgets, [], categories, '2027-01').rolled_over.Travel).toBe(2000)
  })

  it('returns a deleted category\'s final balance to Ready to assign, never its past spending', () => {
    const budgets = [budget('2026-10', INCOME_CATEGORY, '5000'), budget('2026-10', 'Travel', '1000')]
    const expenses = [expense('2026-10-10', 'Travel', '800')]
    const before = carryFrom(budgets, expenses, categories, '2026-11')
    expect(before).toEqual({ ready_to_assign: 4000, rolled_over: { Travel: 200 } })
    const withoutTravel = categories.filter((c) => c.name !== 'Travel')
    expect(carryFrom(budgets, expenses, withoutTravel, '2026-11')).toEqual({ ready_to_assign: 4200, rolled_over: {} })
    // November: Travel's carried 1000 target is gone too, so 5200 more to assign, not 6000.
    const nov = computeEnvelopeState(budgets, expenses, '2026-11', withoutTravel, [], undefined, carryFrom(budgets, expenses, withoutTravel, '2026-11'))
    expect(nov.readyToAssign).toBe(9200)
    // Still conserved a month later.
    expect(carryFrom(budgets, expenses, withoutTravel, '2026-12').ready_to_assign).toBe(9200)
  })

  it('takes a deleted category\'s spending out of Ready to assign the month it was deleted', () => {
    const budgets = [budget('2026-11', INCOME_CATEGORY, '5000'), budget('2026-11', 'Food', '1000'), budget('2026-11', 'Gym', '1000')]
    const expenses = [expense('2026-11-05', 'Gym', '800')]
    const food = [{ name: 'Food', group: '' }]
    // November with Gym deleted: its 800 is spent, so 3200 left, not 4000.
    expect(computeEnvelopeState(budgets, expenses, '2026-11', food, []).readyToAssign).toBe(3200)
    // And December inherits the same 3200, so nothing jumps when the month turns.
    expect(carryFrom(budgets, expenses, food, '2026-12')).toEqual({ ready_to_assign: 3200, rolled_over: { Food: 1000 } })
  })

  it('doesn\'t replay an old target into the months before a re-created category\'s `since`', () => {
    // Gym: 1000 a month, 700 left in October, deleted in November, re-created in February.
    const budgets = [budget('2026-10', INCOME_CATEGORY, '5000'), budget('2026-10', 'Gym', '1000'), budget('2027-02', 'Gym', '0')]
    const expenses = [expense('2026-10-05', 'Gym', '300')]
    const gym = [{ name: 'Gym', group: '', since: '2027-02' }]
    const carry = carryFrom(budgets, expenses, gym, '2027-02')
    // Oct 4700 + 5000 for each of Nov, Dec, Jan. Gym starts empty.
    expect(carry).toEqual({ ready_to_assign: 19700, rolled_over: {} })
    const feb = computeEnvelopeState(budgets, expenses, '2027-02', gym, [], undefined, carry)
    expect(feb.envelopes.find((e) => e.category === 'Gym')).toMatchObject({ assigned: 0, available: 0 })
    expect(feb.readyToAssign).toBe(24700)
  })

  it('starts the carry at the space\'s first budget month, so imported earlier months don\'t carry', () => {
    const budgets = [budget('2026-12', INCOME_CATEGORY, '5000'), budget('2026-12', 'Food', '300')]
    // An October statement imported later, before any budget existed.
    const expenses = [expense('2026-10-05', 'Food', '120'), expense('2026-10-09', 'Travel', '60')]
    expect(carryFrom(budgets, expenses, categories, '2026-12')).toEqual({ ready_to_assign: 0, rolled_over: {} })
    expect(carryFrom(budgets, expenses, categories, '2027-01')).toEqual({ ready_to_assign: 4700, rolled_over: { Food: 300 } })
  })

  it('rounds to paise', () => {
    const budgets = [budget('2026-10', INCOME_CATEGORY, '0.3'), budget('2026-10', 'Travel', '0.1')]
    const expenses = [expense('2026-10-02', 'Travel', '0.2'), expense('2026-10-03', 'Travel', '0.1')]
    // 0.1 - 0.2 - 0.1 is -0.20000000000000004 in floats.
    const carry = carryFrom(budgets, expenses, categories, '2026-11')
    expect(carry.rolled_over.Travel).toBe(-0.2)
    expect(carry.ready_to_assign).toBe(0.2)
  })
})

function next(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

describe('computeCarry', () => {
  const USER = 'carry-test'
  const auth = { userId: USER, readOnly: false, sessionId: null, spaceId: USER, spaceOwnerId: USER, spaceRole: 'owner' as const }
  let server: MongoMemoryReplSet

  beforeAll(async () => {
    server = await startMongoReplSet()
    vi.stubEnv('MONGODB_URI', server.getUri('carry'))
    vi.stubEnv('FIELD_KEY_V1', randomBytes(32).toString('base64'))
  }, 120_000)
  afterAll(async () => {
    if (server) { await (await getClient()).close(); await server.stop() }
    vi.unstubAllEnvs()
  })
  beforeEach(async () => {
    const db = await getDb()
    for (const name of ['budgets', 'expenses', 'categories']) await db.collection(name).deleteMany({})
  })

  it('reads the space\'s encrypted rows and returns the carry for the month', async () => {
    const db = await getDb()
    const mine = (name: string) => scoped(db.collection(name), USER)
    await mine('categories').insertOne({ name: 'Travel', group: '' })
    await mine('budgets').insertOne({ month: '2026-10', category: 'Travel', assigned: '100', rolled_over: '0', version: 1 })
    await mine('budgets').insertOne({ month: '2026-10', category: INCOME_CATEGORY, assigned: '0', rolled_over: '0', extra: '5000', version: 1 })
    await mine('expenses').insertOne({ date: '2026-10-12', category: 'Travel', amount_inr: '5', item: 'bus' })
    // Someone else's space never leaks in.
    await scoped(db.collection('expenses'), 'someone-else').insertOne({ date: '2026-10-13', category: 'Travel', amount_inr: '40', item: 'cab' })

    expect(await computeCarry(auth, '2026-11')).toEqual({ month: '2026-11', ready_to_assign: 4900, rolled_over: { Travel: 95 } })
  })

  it('reads a re-created category\'s `since`', async () => {
    const db = await getDb()
    const mine = (name: string) => scoped(db.collection(name), USER)
    await mine('categories').insertOne({ name: 'Travel', group: '', since: '2026-12' })
    await mine('budgets').insertOne({ month: '2026-10', category: 'Travel', assigned: '100', rolled_over: '0', version: 1 })
    await mine('budgets').insertOne({ month: '2026-10', category: INCOME_CATEGORY, assigned: '5000', rolled_over: '0', version: 1 })
    // November is before Travel's `since`, so its old 100 target isn't reserved.
    expect(await computeCarry(auth, '2026-12')).toEqual({ month: '2026-12', ready_to_assign: 10000, rolled_over: {} })
  })
})
