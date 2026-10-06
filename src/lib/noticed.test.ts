import { describe, expect, it } from 'vitest'
import { learnedDates, noticedLine, weeklyRepeat } from './noticed'

const row = (id: string, date: string, item: string) => ({ id, date, item })

describe('weeklyRepeat', () => {
  const rows = [
    row('a', '2026-10-01', 'Chai'),
    row('b', '2026-10-04', 'chai '),
    row('c', '2026-10-06', 'Uber'),
    row('d', '2026-09-29', 'Chai'), // 8 days before 7 Oct: outside the week
  ]

  it('counts the same item over the 7 days ending on its date, this one included', () => {
    expect(weeklyRepeat(rows, { id: 'new', item: 'Chai', date: '2026-10-07' })).toBe(3)
  })

  it('does not double count the new expense once the list has refetched with it', () => {
    expect(weeklyRepeat([...rows, row('new', '2026-10-07', 'Chai')], { id: 'new', item: 'Chai', date: '2026-10-07' })).toBe(3)
  })

  it('recognises the new row by timestamp when an older server returned no id', () => {
    const self = { id: 'srv-1', date: '2026-10-07', item: 'Chai', timestamp: '2026-10-07T09:00:00' }
    expect(weeklyRepeat([self], { item: 'Chai', date: '2026-10-07', timestamp: '2026-10-07T09:00:00' })).toBe(1)
  })

  it('ignores later dates, other items and blank items', () => {
    expect(weeklyRepeat([row('x', '2026-10-09', 'Chai')], { item: 'Chai', date: '2026-10-07' })).toBe(1)
    expect(weeklyRepeat(rows, { item: 'Lunch', date: '2026-10-07' })).toBe(1)
    expect(weeklyRepeat(rows, { item: '  ', date: '2026-10-07' })).toBe(0)
  })
})

describe('noticedLine', () => {
  it('speaks up from the second time, with an ordinal', () => {
    expect(noticedLine('Chai', 1)).toBeNull()
    expect(noticedLine('Chai', 2)).toBe("Noted. That's your 2nd Chai this week.")
    expect(noticedLine('Chai', 3)).toBe("Noted. That's your 3rd Chai this week.")
    expect(noticedLine('Chai', 4)).toBe("Noted. That's your 4th Chai this week.")
    expect(noticedLine('Chai', 11)).toBe("Noted. That's your 11th Chai this week.")
    expect(noticedLine('Chai', 21)).toBe("Noted. That's your 21st Chai this week.")
  })

  it('trims the item', () => {
    expect(noticedLine(' Chai ', 2)).toBe("Noted. That's your 2nd Chai this week.")
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
