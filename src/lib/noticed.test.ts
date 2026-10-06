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
  it('merges server dates with local ones inside the week, sorted and unique', () => {
    const local = [row('a', '2026-10-03', 'Chai'), row('b', '2026-10-05', 'Uber'), row('c', '2026-09-30', 'x'), row('d', '2026-10-08', 'y')]
    expect(learnedDates(['2026-10-01', '2026-10-03'], local, '2026-10-01')).toEqual(['2026-10-01', '2026-10-03', '2026-10-05'])
  })
})
