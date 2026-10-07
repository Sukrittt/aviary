import { describe, it, expect } from 'vitest'
import { defaultAccountFor } from './defaultAccount'
import type { AccountRow } from '../types'

const acc = (id: string, archived = false): AccountRow => ({ id, name: id, type: 'bank', archived, created_at: '' })
const row = (category: string, account_id: string, date: string) => ({ category, account_id, date, timestamp: `${date}T10:00:00` })

describe('defaultAccountFor', () => {
  const accounts = [acc('hdfc'), acc('card'), acc('cash')]

  it("picks the account this category is usually paid from", () => {
    const rows = [row('Food', 'card', '2026-10-01'), row('Food', 'card', '2026-10-02'), row('Food', 'cash', '2026-10-07'), row('Rent', 'hdfc', '2026-10-08')]
    expect(defaultAccountFor(rows, 'Food', accounts)).toBe('card')
  })

  it('falls back to the last account used, then the first', () => {
    const rows = [row('Rent', 'hdfc', '2026-10-01'), row('Fun', 'cash', '2026-10-05')]
    expect(defaultAccountFor(rows, 'Food', accounts)).toBe('cash')
    expect(defaultAccountFor([], 'Food', accounts)).toBe('hdfc')
  })

  it('ignores archived accounts and has nothing to offer without accounts', () => {
    const rows = [row('Food', 'old', '2026-10-01')]
    expect(defaultAccountFor(rows, 'Food', [acc('old', true), acc('hdfc')])).toBe('hdfc')
    expect(defaultAccountFor(rows, 'Food', [])).toBe('')
  })
})
