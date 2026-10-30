import { describe, it, expect } from 'vitest'
import { computeWrapped } from './wrappedAdapter'
import type { Row } from '@/lib/models'

function expense(date: string, amountInr: number, overrides: Partial<Row> = {}): Row {
  return {
    timestamp: `${date}T00:00:00`,
    date,
    item: 'Coffee',
    amount_inr: String(amountInr),
    category: 'Food',
    notes: '',
    source: '',
    amount: String(amountInr),
    description: '',
    payment_method: '',
    ...overrides,
  }
}

describe('computeWrapped', () => {
  it('returns an empty recap for a month with no rows', () => {
    const data = computeWrapped([], '2026-08')
    expect(data.month).toBe('2026-08')
    expect(data.totalTransactions).toBe(0)
    expect(data.totalSpent).toBe(0)
    expect(data.weeklyTotals).toEqual([])
  })

  it('excludes rows from adjacent months', () => {
    const docs = [expense('2026-07-31', 500), expense('2026-08-01', 100), expense('2026-09-01', 500)]
    const data = computeWrapped(docs, '2026-08')
    expect(data.totalTransactions).toBe(1)
    expect(data.totalSpent).toBe(100)
  })

  it('excludes refunds (amount <= 0)', () => {
    const docs = [expense('2026-08-01', 100), expense('2026-08-02', 0), expense('2026-08-03', -50)]
    const data = computeWrapped(docs, '2026-08')
    expect(data.totalTransactions).toBe(1)
  })

  it('buckets weeklyTotals into 4 fixed day-of-month ranges summing to totalSpent', () => {
    const docs = [
      expense('2026-08-03', 100), // 1-7
      expense('2026-08-10', 200), // 8-14
      expense('2026-08-17', 300), // 15-21
      expense('2026-08-25', 400), // 22-end
    ]
    const data = computeWrapped(docs, '2026-08')
    expect(data.weeklyTotals).toEqual([
      { label: '1-7', total: 100 },
      { label: '8-14', total: 200 },
      { label: '15-21', total: 300 },
      { label: '22-end', total: 400 },
    ])
    expect(data.weeklyTotals.reduce((s, w) => s + w.total, 0)).toBe(data.totalSpent)
  })

  it('produces 4 weekly buckets on a 28-day month', () => {
    const docs = [expense('2026-02-01', 100), expense('2026-02-28', 200)]
    const data = computeWrapped(docs, '2026-02')
    expect(data.weeklyTotals).toHaveLength(4)
    expect(data.weeklyTotals[0].total).toBe(100)
    expect(data.weeklyTotals[3].total).toBe(200)
  })

  it('picks the biggest single purchase within the month', () => {
    const docs = [expense('2026-08-01', 100), expense('2026-08-02', 900, { item: 'Shoes' })]
    const data = computeWrapped(docs, '2026-08')
    expect(data.biggestPurchase).toEqual({ item: 'Shoes', amountInr: 900, category: 'Food', date: '2026-08-02' })
  })

  it('ranks topCategories by total spend', () => {
    const docs = [
      expense('2026-08-01', 100, { category: 'Food' }),
      expense('2026-08-02', 300, { category: 'Rent' }),
      expense('2026-08-03', 50, { category: 'Food' }),
    ]
    const data = computeWrapped(docs, '2026-08')
    expect(data.topCategories[0]).toMatchObject({ category: 'Rent', total: 300 })
    expect(data.topCategories[1]).toMatchObject({ category: 'Food', total: 150 })
  })
})

describe('computeWrapped and card payments', () => {
  it('a credit card payment is not spending', () => {
    const data = computeWrapped([expense('2026-08-01', 5000), expense('2026-08-02', 5000, { category: '__credit_card__', item: 'Card bill' })], '2026-08')
    expect(data.totalSpent).toBe(5000)
    expect(data.totalTransactions).toBe(1)
    expect(data.topCategories.map((c) => c.category)).toEqual(['Food'])
  })
})
