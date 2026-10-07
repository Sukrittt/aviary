import { describe, it, expect } from 'vitest'
import type { CaptureProposal } from '@/src/api/ai'
import { canLog, editedCount, keptRows, rowIncomplete, rowShare, rowToExpense, rowTotal, toRows, GAP_ORIGIN } from './captureRows'

const proposal: CaptureProposal = {
  id: 'p1',
  items: [
    { id: 'r1', item: 'Auto', amount: 240, splitWays: 1, date: '2026-09-26', category: 'Travel', categoryConfidence: 1 },
    { id: 'r2', item: 'Turf', amount: 1200, splitWays: 6, date: '2026-09-26', category: 'Sports', categoryConfidence: 0.88 },
    { id: 'r3', item: 'Thing', amount: 99, splitWays: 1, date: '2026-09-25', category: '', categoryConfidence: 0.4 },
  ],
  skipped: [],
  unparsed: [],
}
const formatTotal = (n: number) => `₹${n.toLocaleString('en-IN')}`

describe('captureRows', () => {
  it('turns a proposal into editable rows', () => {
    expect(toRows(proposal)[1]).toEqual({ id: 'r2', item: 'Turf', amountText: '1200', splitWays: 6, date: '2026-09-26', category: 'Sports', removed: false })
  })

  it('reads the typed total and rejects anything that is not a positive amount', () => {
    const [row] = toRows(proposal)
    expect(rowTotal({ ...row, amountText: '240.5' })).toBe(240.5)
    for (const bad of ['', '0', '12.', 'abc', '-5', '1.234']) expect(rowTotal({ ...row, amountText: bad })).toBeNaN()
  })

  it('logs only the user share of a split, to the paisa', () => {
    const [, turf] = toRows(proposal)
    expect(rowShare(turf)).toBe(200)
    expect(rowShare({ ...turf, amountText: '1000', splitWays: 3 })).toBe(333.33)
  })

  it('flags a row with no envelope, no name or a bad amount', () => {
    const rows = toRows(proposal)
    expect(rowIncomplete(rows[0])).toBe(false)
    expect(rowIncomplete(rows[2])).toBe(true)
    expect(rowIncomplete({ ...rows[0], item: '  ' })).toBe(true)
    expect(rowIncomplete({ ...rows[0], amountText: '' })).toBe(true)
  })

  it('can log once every kept row is complete', () => {
    const rows = toRows(proposal)
    expect(canLog(rows)).toBe(false)
    const fixed = rows.map((r) => (r.id === 'r3' ? { ...r, category: 'Shopping' } : r))
    expect(canLog(fixed)).toBe(true)
    const removed = rows.map((r) => (r.id === 'r3' ? { ...r, removed: true } : r))
    expect(canLog(removed)).toBe(true)
    expect(keptRows(removed)).toHaveLength(2)
  })

  it('cannot log a card with every row removed', () => {
    expect(canLog(toRows(proposal).map((r) => ({ ...r, removed: true })))).toBe(false)
  })

  it('counts the rows the user changed', () => {
    const rows = toRows(proposal)
    rows[0] = { ...rows[0], amountText: '260' }
    rows[2] = { ...rows[2], category: 'Shopping' }
    expect(editedCount(rows, proposal)).toBe(2)
  })

  it('builds the expense with a client_id fixed by the proposal and row', () => {
    const [auto, turf] = toRows(proposal)
    expect(rowToExpense('p1', auto, formatTotal)).toEqual({
      item: 'Auto',
      amount_inr: '240',
      category: 'Travel',
      date: '2026-09-26',
      source: 'text',
      client_id: 'capture:p1:r1',
    })
    expect(rowToExpense('p1', turf, formatTotal)).toMatchObject({
      amount_inr: '200',
      notes: 'Split 6 ways · ₹1,200 total',
      client_id: 'capture:p1:r2',
    })
  })

  it('marks a balance check estimate as one, keeping how it was paid', () => {
    const [row] = toRows({
      ...proposal,
      id: 'c1',
      items: [{ id: 'g1', item: 'Unlogged card spends', amount: 1800, splitWays: 1, date: '2026-09-27', category: 'Shopping', categoryConfidence: null, paymentMethod: 'credit_card' }],
    })
    expect(row.paymentMethod).toBe('credit_card')
    expect(rowToExpense('c1', row, formatTotal, GAP_ORIGIN)).toEqual({
      item: 'Unlogged card spends',
      amount_inr: '1800',
      category: 'Shopping',
      date: '2026-09-27',
      notes: 'Estimated from a balance check',
      payment_method: 'credit_card',
      source: 'balance_gap',
      client_id: 'gap:c1:g1',
    })
  })
})
