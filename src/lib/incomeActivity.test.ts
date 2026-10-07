import { describe, it, expect } from 'vitest'
import { incomesForPage, type IncomeWindow } from './incomeActivity'
import type { IncomeRow } from '../types'

const inc = (date: string, label = 'Salary', account_id = ''): IncomeRow => ({
  id: `${date}-${label}`, version: 0, date, amount: '100', label, notes: '', account_id, recurring_id: '', source: 'manual', counted: 'extra', created_at: '',
})
const base: IncomeWindow = { from: '2026-10-01', to: '2026-10-31', pageMin: null, prevPageMin: null, page: 1, isLastPage: true }
const dates = (rows: IncomeRow[]) => rows.map((r) => r.date)

describe('incomesForPage', () => {
  const all = [inc('2026-10-30'), inc('2026-10-20'), inc('2026-10-12'), inc('2026-10-05'), inc('2026-09-30')]

  it('a single page shows everything in the period', () => {
    expect(dates(incomesForPage(all, { ...base, pageMin: '2026-10-10' }))).toEqual(['2026-10-30', '2026-10-20', '2026-10-12', '2026-10-05'])
  })

  it('pages split the period so each income shows once', () => {
    const page1 = incomesForPage(all, { ...base, pageMin: '2026-10-15', isLastPage: false })
    const page2 = incomesForPage(all, { ...base, page: 2, pageMin: '2026-10-08', prevPageMin: '2026-10-15', isLastPage: false })
    const page3 = incomesForPage(all, { ...base, page: 3, pageMin: '2026-10-02', prevPageMin: '2026-10-08' })
    expect(dates(page1)).toEqual(['2026-10-30', '2026-10-20'])
    expect(dates(page2)).toEqual(['2026-10-12'])
    expect(dates(page3)).toEqual(['2026-10-05'])
  })

  it('a day split across pages belongs to the newer page', () => {
    const rows = [inc('2026-10-15')]
    expect(incomesForPage(rows, { ...base, pageMin: '2026-10-15', isLastPage: false })).toHaveLength(1)
    expect(incomesForPage(rows, { ...base, page: 2, pageMin: '2026-10-10', prevPageMin: '2026-10-15' })).toHaveLength(0)
  })

  it('filters by search and account', () => {
    const rows = [inc('2026-10-10', 'Salary', 'a1'), inc('2026-10-11', 'Gift', 'a2')]
    expect(dates(incomesForPage(rows, { ...base, q: 'gif' }))).toEqual(['2026-10-11'])
    expect(dates(incomesForPage(rows, { ...base, account: 'a1' }))).toEqual(['2026-10-10'])
  })
})
