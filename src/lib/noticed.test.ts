import { describe, expect, it } from 'vitest'
import { learnedDates, noticedLine, weeklyRepeat } from './noticed'

const row = (id: string, date: string, item: string, amount_inr = '20') => ({ id, date, item, amount_inr })
const money = (n: number) => `₹${n}`

describe('weeklyRepeat', () => {
  const rows = [
    row('a', '2026-10-01', 'Chai'),
    row('b', '2026-10-04', 'chai '),
    row('c', '2026-10-06', 'Uber', '300'),
    row('d', '2026-09-29', 'Chai'), // 8 days before 7 Oct: outside the week
  ]

  it('counts and totals the same item over the 7 days ending on its date, this one included', () => {
    expect(weeklyRepeat(rows, { id: 'new', item: 'Chai', date: '2026-10-07', amount: 25 })).toEqual({ count: 3, total: 65 })
  })

  it('does not double count the new expense once the list has refetched with it', () => {
    expect(weeklyRepeat([...rows, row('new', '2026-10-07', 'Chai', '25')], { id: 'new', item: 'Chai', date: '2026-10-07', amount: 25 })).toEqual({ count: 3, total: 65 })
  })

  it('recognises the new row by timestamp when an older server returned no id', () => {
    const self = { id: 'srv-1', date: '2026-10-07', item: 'Chai', timestamp: '2026-10-07T09:00:00', amount_inr: '25' }
    expect(weeklyRepeat([self], { item: 'Chai', date: '2026-10-07', timestamp: '2026-10-07T09:00:00', amount: 25 })).toEqual({ count: 1, total: 25 })
  })

  it('ignores later dates, other items and blank items', () => {
    expect(weeklyRepeat([row('x', '2026-10-09', 'Chai')], { item: 'Chai', date: '2026-10-07', amount: 25 })).toEqual({ count: 1, total: 25 })
    expect(weeklyRepeat(rows, { item: 'Lunch', date: '2026-10-07', amount: 25 })).toEqual({ count: 1, total: 25 })
    expect(weeklyRepeat(rows, { item: '  ', date: '2026-10-07', amount: 25 })).toEqual({ count: 0, total: 0 })
  })

  it('treats a missing or bad amount as zero', () => {
    expect(weeklyRepeat([{ id: 'a', date: '2026-10-06', item: 'Chai' }, row('b', '2026-10-06', 'Chai', 'x')], { item: 'Chai', date: '2026-10-07', amount: 25 })).toEqual({ count: 3, total: 25 })
  })
})

describe('noticedLine', () => {
  it('stays quiet until the third time', () => {
    expect(noticedLine({ count: 1, total: 20 }, money)).toBeNull()
    expect(noticedLine({ count: 2, total: 40 }, money)).toBeNull()
  })

  it('gives the ordinal and the week so far from the third time', () => {
    expect(noticedLine({ count: 3, total: 750 }, money)).toBe('3rd time this week · ₹750 so far')
    expect(noticedLine({ count: 4, total: 80 }, money)).toBe('4th time this week · ₹80 so far')
    expect(noticedLine({ count: 11, total: 220 }, money)).toBe('11th time this week · ₹220 so far')
    expect(noticedLine({ count: 21, total: 420 }, money)).toBe('21st time this week · ₹420 so far')
  })

  it('rounds the total', () => {
    expect(noticedLine({ count: 3, total: 749.6 }, money)).toBe('3rd time this week · ₹750 so far')
  })
})

describe('learnedDates', () => {
  const r = (date: string, extra: object = {}) => ({ id: date, date, item: 'Chai', amount_inr: '20', source: 'manual', ...extra })

  it('uses the local list once loaded, inside the week and up to today', () => {
    const local = [r('2026-10-03'), r('2026-10-01'), r('2026-09-30'), r('2026-10-05')]
    expect(learnedDates(['2026-10-02'], local, '2026-10-01', '2026-10-04')).toEqual(['2026-10-01', '2026-10-03'])
  })

  it('drops a day whose expense was deleted, since the local list is the truth', () => {
    expect(learnedDates(['2026-10-01', '2026-10-02'], [r('2026-10-01')], '2026-10-01', '2026-10-03')).toEqual(['2026-10-01'])
  })

  it('skips automatic, refunded and unnamed expenses like the server does', () => {
    const local = [r('2026-10-01', { source: 'recurring' }), r('2026-10-02', { source: 'subscription' }), r('2026-10-03', { amount_inr: '-5' }), r('2026-10-04', { item: ' ' })]
    expect(learnedDates([], local, '2026-10-01', '2026-10-07')).toEqual([])
  })

  it('falls back to the server dates while the list loads', () => {
    expect(learnedDates(['2026-10-02', '2026-10-01', '2026-10-06'], undefined, '2026-10-01', '2026-10-03')).toEqual(['2026-10-01', '2026-10-02'])
  })
})
