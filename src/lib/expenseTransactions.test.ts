import { describe, it, expect } from 'vitest'
import { toTransactions } from './expenseTransactions'
import type { ExpenseRow } from '@/src/types'

const row = (over: Partial<ExpenseRow> = {}): ExpenseRow => ({
  timestamp: '2026-03-11T10:00:00+05:30',
  date: '2026-03-11',
  item: 'Coffee',
  amount_inr: '180',
  category: 'Food',
  notes: '',
  source: 'manual',
  amount: '',
  description: '',
  payment_method: 'upi',
  ...over,
})

describe('toTransactions', () => {
  it('parses the wire strings into the view shape', () => {
    expect(toTransactions([row({ id: 'e1' })])).toEqual([
      {
        id: 'e1',
        timestamp: '2026-03-11T10:00:00+05:30',
        date: '2026-03-11',
        item: 'Coffee',
        amountInr: 180,
        category: 'Food',
        notes: '',
        source: 'manual',
        hasPhoto: false,
      },
    ])
  })

  it('reads a non-numeric amount as zero rather than NaN', () => {
    // NaN would poison every total the list shows.
    expect(toTransactions([row({ amount_inr: '' })])[0].amountInr).toBe(0)
    expect(toTransactions([row({ amount_inr: 'abc' })])[0].amountInr).toBe(0)
  })

  it('fills in an absent id and optional fields', () => {
    const [t] = toTransactions([row({ id: undefined, notes: undefined, source: undefined })])
    expect(t.id).toBe('')
    expect(t.notes).toBe('')
    expect(t.source).toBe('')
  })
})
