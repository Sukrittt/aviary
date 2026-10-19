import { describe, it, expect } from 'vitest'
import { gapToFill, freshStartExpense, statementExpense, creditsLine, daySpan, caughtUp, byDay } from './gap'
import { formatDateShort } from '@/src/lib/format'

const TODAY = '2026-10-19'

describe('gapToFill', () => {
  it('offers a catch-up once the last expense is two days old', () => {
    expect(gapToFill({ Food: '2026-10-17', Travel: '2026-10-12' }, TODAY, null)).toBe('2026-10-17')
  })

  it('stays quiet when something was logged yesterday or today', () => {
    expect(gapToFill({ Food: '2026-10-18', Travel: '2026-10-01' }, TODAY, null)).toBeNull()
    expect(gapToFill({ Food: TODAY }, TODAY, null)).toBeNull()
  })

  it('shows once per gap: a dismissal holds until something new is logged', () => {
    expect(gapToFill({ Food: '2026-10-15' }, TODAY, '2026-10-15')).toBeNull()
    expect(gapToFill({ Food: '2026-10-16' }, TODAY, '2026-10-15')).toBe('2026-10-16')
  })

  it('needs at least one expense, and ignores future-dated ones', () => {
    expect(gapToFill({}, TODAY, null)).toBeNull()
    expect(gapToFill({ Rent: '2026-11-01', Food: '2026-10-10' }, TODAY, null)).toBe('2026-10-10')
  })
})

describe('freshStartExpense', () => {
  it('is one expense dated today, named and keyed by the gap it covers', () => {
    expect(freshStartExpense('3500', 'Food', '2026-10-12', TODAY)).toEqual({
      item: 'Untracked spending',
      amount_inr: '3500',
      category: 'Food',
      date: TODAY,
      notes: 'A rough total for the days you were away',
      source: 'fresh_start',
      client_id: 'fresh:2026-10-12',
    })
  })

  it('takes paise and commas, and turns down anything that isn\'t a positive amount', () => {
    expect(freshStartExpense('1,250.50', 'Food', '2026-10-12', TODAY)?.amount_inr).toBe('1250.5')
    expect(freshStartExpense('1,25,000', 'Food', '2026-10-12', TODAY)?.amount_inr).toBe('125000')
    // A decimal comma, the way much of the world types cents, is not a thousands separator.
    expect(freshStartExpense('12,50', 'Food', '2026-10-12', TODAY)?.amount_inr).toBe('12.5')
    expect(freshStartExpense('1.250,5', 'Food', '2026-10-12', TODAY)).toBeNull()
    for (const bad of ['', '0', 'abc', '-5', '12.345']) expect(freshStartExpense(bad, 'Food', '2026-10-12', TODAY)).toBeNull()
    expect(freshStartExpense('500', '', '2026-10-12', TODAY)).toBeNull()
  })
})

describe('statementExpense', () => {
  it('logs a reviewed row under its hashed client_id', () => {
    expect(statementExpense({ id: 'statement:abc', item: 'Swiggy', amount: 349, date: '2026-10-17' }, 'Food')).toEqual({
      item: 'Swiggy',
      amount_inr: '349',
      category: 'Food',
      date: '2026-10-17',
      source: 'statement',
      client_id: 'statement:abc',
    })
  })
})

describe('creditsLine', () => {
  it('counts what was left out', () => {
    expect(creditsLine(0)).toBeNull()
    expect(creditsLine(1)).toBe('1 credit skipped. Log refunds as income if you want them counted.')
    expect(creditsLine(3)).toBe('3 credits skipped. Log refunds as income if you want them counted.')
  })
})

describe('daySpan', () => {
  it('names the days a review covers, shorter when they share a month', () => {
    expect(daySpan('2026-10-16', '2026-10-16')).toBe('16 Oct')
    expect(daySpan('2026-10-16', '2026-10-19')).toBe('16 to 19 Oct')
    expect(daySpan('2026-09-28', '2026-10-03')).toBe(`${formatDateShort('2026-09-28')} to 3 Oct`)
    expect(daySpan('2025-12-30', '2026-01-02')).toBe(`${formatDateShort('2025-12-30')} to 2 Jan`)
  })
})

describe('caughtUp', () => {
  const kept = [
    { amount: 349, date: '2026-10-14', category: '🍜 Eating out' },
    { amount: 0.1, date: '2026-10-15', category: '🛒 Groceries' },
    { amount: 1240.5, date: '2026-10-17', category: '🛒 Groceries' },
    { amount: 0.2, date: '2026-10-18', category: '🍜 Eating out' },
  ]

  it('adds up what was logged in paise, so the total is exact', () => {
    const done = caughtUp(kept)
    expect(done.count).toBe(4)
    expect(done.total).toBe(1589.8)
    expect(done.from).toBe('2026-10-14')
    expect(done.to).toBe('2026-10-18')
  })

  it('says where the money went, biggest first', () => {
    expect(caughtUp(kept).categories).toEqual([
      { name: '🛒 Groceries', total: 1240.6 },
      { name: '🍜 Eating out', total: 349.2 },
    ])
  })

  it('takes rows in any order', () => {
    const done = caughtUp([...kept].reverse())
    expect([done.from, done.to]).toEqual(['2026-10-14', '2026-10-18'])
  })
})

describe('byDay', () => {
  it('groups rows under their day, oldest first, keeping order within a day', () => {
    const rows = [
      { id: 'b', date: '2026-10-19' },
      { id: 'a', date: '2026-10-16' },
      { id: 'c', date: '2026-10-19' },
    ]
    expect(byDay(rows)).toEqual([
      { date: '2026-10-16', rows: [{ id: 'a', date: '2026-10-16' }] },
      { date: '2026-10-19', rows: [{ id: 'b', date: '2026-10-19' }, { id: 'c', date: '2026-10-19' }] },
    ])
  })
})
