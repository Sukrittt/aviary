import { describe, it, expect } from 'vitest'
import { unusualAmount } from './unusualAmount'
import type { ExpenseRow } from '@/src/types'

const row = (date: string, amount: number, category = 'Dining'): ExpenseRow => ({
  date, amount_inr: String(amount), category,
  timestamp: '', item: '', notes: '', source: '', amount: '', description: '', payment_method: '',
})

const TODAY = '2026-09-24'
// Eight Dining meals over the last month: 400..750, median 575.
const history = [400, 450, 500, 550, 600, 650, 700, 750].map((a, i) => row(`2026-09-${String(10 + i).padStart(2, '0')}`, a))

describe('unusualAmount', () => {
  it('flags an extra zero', () => {
    expect(unusualAmount(5750, 'Dining', history, TODAY)).toEqual({ typical: 575, ratio: 10 })
  })

  it('stays quiet under 5x the typical amount', () => {
    expect(unusualAmount(2800, 'Dining', history, TODAY)).toBeNull()
  })

  it('stays quiet when the category has seen an amount this big before', () => {
    expect(unusualAmount(5000, 'Dining', [...history, row('2026-08-01', 6000)], TODAY)).toBeNull()
  })

  it('needs 8 past expenses in the category', () => {
    expect(unusualAmount(5750, 'Dining', history.slice(1), TODAY)).toBeNull()
  })

  it('only looks at the same category in the last 90 days', () => {
    const noise = [row('2026-06-01', 10), row('2026-09-01', 10, 'Travel')]
    // Neither the 91-day-old row nor the Travel row lowers the median.
    expect(unusualAmount(5750, 'Dining', [...history, ...noise], TODAY)).toEqual({ typical: 575, ratio: 10 })
    expect(unusualAmount(5750, 'Dining', history.slice(1), TODAY)).toBeNull()
  })

  it('ignores zero and unparseable amounts', () => {
    expect(unusualAmount(0, 'Dining', history, TODAY)).toBeNull()
    expect(unusualAmount(5750, 'Dining', [...history.slice(1), row('2026-09-01', 0)], TODAY)).toBeNull()
  })
})
