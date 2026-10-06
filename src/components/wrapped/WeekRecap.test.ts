import { describe, expect, it } from 'vitest'
import { formatMinute, recapSlides } from './WeekRecap'
import type { WeekRecap } from '@/src/api/weekRecap'

const money = (n: number) => `₹${n}`
const recap: WeekRecap = {
  startDate: '2026-10-01',
  endDate: '2026-10-07',
  totalTransactions: 6,
  totalSpent: 2615,
  daysLogged: 5,
  topCategory: { category: 'Shopping', total: 2000, pct: 76.5 },
  biggest: { item: 'Shoes', category: 'Shopping', amountInr: 2000, date: '2026-10-06' },
  repeats: [{ item: 'Chai', category: 'Food', count: 3 }, { item: 'Uber', category: 'Transport', count: 2 }],
  usualMinute: 1230,
}

describe('formatMinute', () => {
  it('rounds to the half hour in 12h time', () => {
    expect(formatMinute(1230)).toBe('8:30pm')
    expect(formatMinute(1263)).toBe('9pm')
    expect(formatMinute(0)).toBe('12am')
    expect(formatMinute(725)).toBe('12pm')
    expect(formatMinute(1435)).toBe('12am')
  })
})

describe('recapSlides', () => {
  it('walks through what was learned and ends on a send-off', () => {
    const slides = recapSlides(recap, money)
    expect(slides.map((s) => s.eyebrow)).toEqual(['Your first week', 'Your regulars', 'Your logging hour', 'Where it went', 'Biggest spend', 'Week one · done'])
    expect(slides[1].title).toBe('Chai, 3 times')
    expect(slides[2].title).toBe('Around 8:30pm')
  })

  it('skips slides with nothing to say', () => {
    const slides = recapSlides({ ...recap, repeats: [], usualMinute: null }, money)
    expect(slides.map((s) => s.eyebrow)).not.toContain('Your regulars')
    expect(slides.map((s) => s.eyebrow)).not.toContain('Your logging hour')
  })

  it('asks for more on a light week', () => {
    const slides = recapSlides({ ...recap, totalTransactions: 2 }, money)
    expect(slides).toHaveLength(1)
    expect(slides[0].title).toBe("Let's get to know you")
  })

  it('never uses an em dash', () => {
    for (const s of recapSlides(recap, money)) expect(`${s.title}${s.body}`).not.toContain('—')
  })
})
