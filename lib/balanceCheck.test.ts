import { describe, it, expect } from 'vitest'
import {
  anchorOf,
  cardShortfall,
  classify,
  gapProposal,
  isDue,
  loggedPct,
  parseAccounts,
  sameAccounts,
  paidByCard,
  paidFromBank,
  spendBetween,
  splitByHabit,
  toleranceFor,
  type CheckExpense,
  type StoredCheck,
} from './balanceCheck'

const exp = (timestamp: string, amount: number, category = 'Food', paymentMethod = 'bank', source = 'manual'): CheckExpense => ({
  timestamp,
  amount,
  category,
  paymentMethod,
  source,
})

describe('spendBetween', () => {
  const expenses = [
    exp('2026-09-20T09:00:00+05:30', 100), // at the last check: already counted then
    exp('2026-09-20T09:00:01+05:30', 240),
    exp('2026-09-22T13:00:00+05:30', 150, 'Food', 'upi'),
    exp('2026-09-23T13:00:00+05:30', 999, 'Shopping', 'credit_card'),
    exp('2026-09-24T13:00:00+05:30', 60, 'Food', 'cash'),
    exp('2026-09-25T13:00:00+05:30', 500, 'Food', 'bank', 'balance_gap'),
    exp('2026-09-28T10:00:00+05:30', 80), // after this check
  ]

  it('counts bank spends after the last check and up to this one', () => {
    expect(spendBetween(expenses, '2026-09-20T09:00:00+05:30', '2026-09-27T10:00:00+05:30', paidFromBank)).toBe(390)
  })

  it('never counts an earlier estimate as something the user logged', () => {
    const total = spendBetween(expenses, '2026-09-19T00:00:00+05:30', '2026-09-30T00:00:00+05:30', paidFromBank)
    expect(total).toBe(100 + 240 + 150 + 80)
  })

  it('keeps card spends separate', () => {
    expect(spendBetween(expenses, '2026-09-19T00:00:00+05:30', '2026-09-30T00:00:00+05:30', paidByCard)).toBe(999)
  })
})

describe('toleranceFor', () => {
  const history = [exp('t', 50), exp('t', 150), exp('t', 200), exp('t', 300), exp('t', 30000)]

  it('is one typical purchase', () => {
    expect(toleranceFor(100000, history)).toBe(200)
  })

  it('is capped at 1% of the balance', () => {
    expect(toleranceFor(5000, history)).toBe(50)
  })

  it('falls back to 1% of the balance with no history, and to the typical purchase with no balance', () => {
    expect(toleranceFor(42000, [])).toBe(420)
    expect(toleranceFor(0, history)).toBe(200)
  })
})

describe('classify', () => {
  it('calls a small gap square either way', () => {
    expect(classify(150, 200)).toBe('square')
    expect(classify(-150, 200)).toBe('square')
  })

  it('tells money that left from money that came in', () => {
    expect(classify(3400, 200)).toBe('unlogged')
    expect(classify(-5000, 200)).toBe('surplus')
  })
})

describe('splitByHabit', () => {
  const history = [
    ...Array.from({ length: 10 }, () => exp('t', 300, 'Food')),
    ...Array.from({ length: 6 }, () => exp('t', 250, 'Travel')),
    ...Array.from({ length: 2 }, () => exp('t', 400, 'Shopping')),
    exp('t', 30000, 'Rent'), // not an everyday spend
    exp('t', 5000, 'Shopping', 'credit_card'),
    exp('t', 649, 'Subscriptions', 'bank', 'subscription'),
  ]

  it('spreads across the top everyday envelopes, whole units, adding up exactly', () => {
    const rows = splitByHabit(3400, history, 'bank')
    expect(rows.map((r) => r.category)).toEqual(['Food', 'Travel', 'Shopping'])
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(3400)
    expect(rows.every((r) => Number.isInteger(r.amount) && r.paymentMethod === 'bank')).toBe(true)
  })

  it('leaves out rent-sized payments and subscriptions', () => {
    const rows = splitByHabit(1000, history, 'bank')
    expect(rows.map((r) => r.category)).not.toContain('Rent')
    expect(rows.map((r) => r.category)).not.toContain('Subscriptions')
  })

  it('folds a sliver into the others', () => {
    const lopsided = [...Array.from({ length: 30 }, () => exp('t', 300, 'Food')), exp('t', 100, 'Books')]
    expect(splitByHabit(1000, lopsided, 'bank')).toEqual([{ category: 'Food', amount: 1000, paymentMethod: 'bank' }])
  })

  it('uses card habits for card rows', () => {
    expect(splitByHabit(1800, history, 'credit_card')).toEqual([{ category: 'Shopping', amount: 1800, paymentMethod: 'credit_card' }])
  })

  it('leaves the envelope to the user with no history, and returns nothing for nothing', () => {
    expect(splitByHabit(500, [], 'bank')).toEqual([{ category: '', amount: 500, paymentMethod: 'bank' }])
    expect(splitByHabit(0, history, 'bank')).toEqual([])
  })
})

describe('cardShortfall', () => {
  it('flags a bill clearly bigger than the card spends logged', () => {
    expect(cardShortfall(9000, 7000, 200)).toBe(2000)
  })

  it('lets statement timing noise through', () => {
    expect(cardShortfall(9000, 8000, 200)).toBe(0) // 11%, under the 15% margin
    expect(cardShortfall(500, 300, 250)).toBe(0) // under the tolerance
    expect(cardShortfall(5000, 7000, 200)).toBe(0)
  })
})

describe('loggedPct', () => {
  it('is the share the user logged themselves', () => {
    expect(loggedPct(9200, 800)).toBe(92)
    expect(loggedPct(0, 0)).toBe(100)
  })
})

describe('isDue', () => {
  it('is due with no check yet, or a week after the last', () => {
    expect(isDue(null, '2026-09-27T10:00:00+05:30')).toBe(true)
    expect(isDue('2026-09-20T10:00:00+05:30', '2026-09-27T10:00:00+05:30')).toBe(true)
    expect(isDue('2026-09-21T10:00:00+05:30', '2026-09-27T10:00:00+05:30')).toBe(false)
  })
})

describe('anchorOf', () => {
  const check = (status: StoredCheck['status']) => ({ status }) as StoredCheck
  it('measures from the newest check that is not an open gap', () => {
    expect(anchorOf([check('open'), check('resolved')])?.status).toBe('resolved')
    expect(anchorOf([check('square')])?.status).toBe('square')
    expect(anchorOf([])).toBeNull()
  })
})

describe('gapProposal', () => {
  it('names bank and card estimates and keeps row ids stable', () => {
    const proposal = gapProposal('c1', '2026-09-27', [
      { category: 'Food', amount: 2000, paymentMethod: 'bank' },
      { category: 'Shopping', amount: 1800, paymentMethod: 'credit_card' },
    ])
    expect(proposal?.id).toBe('c1')
    expect(proposal?.items).toEqual([
      { id: 'g1', item: 'Unlogged spends', amount: 2000, splitWays: 1, date: '2026-09-27', category: 'Food', categoryConfidence: null, paymentMethod: 'bank' },
      { id: 'g2', item: 'Unlogged card spends', amount: 1800, splitWays: 1, date: '2026-09-27', category: 'Shopping', categoryConfidence: null, paymentMethod: 'credit_card' },
    ])
  })

  it('is null when there is nothing to estimate', () => {
    expect(gapProposal('c1', '2026-09-27', [])).toBeNull()
  })
})

describe('parseAccounts', () => {
  it('trims names and totals the balances', () => {
    expect(parseAccounts([{ name: ' HDFC ', balance: 42000 }, { name: 'Slice', balance: '8000.5' }])).toEqual({
      accounts: [{ name: 'HDFC', balance: 42000 }, { name: 'Slice', balance: 8000.5 }],
      total: 50000.5,
    })
  })

  it('allows an overdrawn account', () => {
    expect(parseAccounts([{ name: 'HDFC', balance: -200 }])?.total).toBe(-200)
  })

  it('rejects an empty list, too many accounts, blank or repeated names, and bad balances', () => {
    expect(parseAccounts([])).toBeNull()
    expect(parseAccounts('HDFC')).toBeNull()
    expect(parseAccounts(Array.from({ length: 6 }, (_, i) => ({ name: `A${i}`, balance: 1 })))).toBeNull()
    expect(parseAccounts([{ name: '  ', balance: 1 }])).toBeNull()
    expect(parseAccounts([{ name: 'x'.repeat(31), balance: 1 }])).toBeNull()
    expect(parseAccounts([{ name: 'HDFC', balance: 1 }, { name: 'hdfc', balance: 2 }])).toBeNull()
    expect(parseAccounts([{ name: 'HDFC', balance: 'lots' }])).toBeNull()
  })
})

describe('sameAccounts', () => {
  it('ignores order and case', () => {
    expect(sameAccounts(['HDFC', 'Slice'], ['slice', 'hdfc'])).toBe(true)
  })

  it('spots an account added or removed', () => {
    expect(sameAccounts(['HDFC'], ['HDFC', 'Slice'])).toBe(false)
    expect(sameAccounts(['HDFC', 'Slice'], ['HDFC'])).toBe(false)
    expect(sameAccounts(['HDFC'], ['Slice'])).toBe(false)
  })

  it('takes an unnamed single balance from before accounts as the same one account', () => {
    expect(sameAccounts([], ['HDFC'])).toBe(true)
    expect(sameAccounts([], ['HDFC', 'Slice'])).toBe(false)
  })
})
