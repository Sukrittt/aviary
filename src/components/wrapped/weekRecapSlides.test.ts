import { describe, expect, it } from 'vitest'
import { formatMinute, recapSlides } from './weekRecapSlides'
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
  loggedDates: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06'],
  logMinutes: [550, 580, 1230, 1260, 1265, 1275],
  categories: [{ category: 'Shopping', total: 2000, pct: 76.5 }],
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

  it('tags each slide with the visual it gets', () => {
    expect(recapSlides(recap, money).map((s) => s.kind)).toEqual(['intro', 'regulars', 'hour', 'categories', 'biggest', 'done'])
    expect(recapSlides({ ...recap, totalTransactions: 0 }, money)[0].kind).toBe('light')
  })

  it('picks a quip for the time of day', () => {
    const quip = (usualMinute: number) => recapSlides({ ...recap, usualMinute }, money)[2].body
    expect(quip(8 * 60)).toBe('Early bird. We respect it.')
    expect(quip(13 * 60)).toBe('A midday check-in. Very organised.')
    expect(quip(19 * 60)).toBe('The evening wind-down, wallet edition.')
    expect(quip(23 * 60)).toBe('Night owl logging. The bird approves.')
  })

  it('reads the biggest spend against the week', () => {
    const body = (amountInr: number) => recapSlides({ ...recap, biggest: { ...recap.biggest!, amountInr } }, money)[4].body
    expect(body(2000)).toBe('Half your week in one go. Bold.')
    expect(body(300)).toBe('The splurge of the week.')
  })

  it('names the top category without its emoji, with a share and a quip', () => {
    const slide = recapSlides({ ...recap, topCategory: { category: '🛍️ Shopping', total: 2000, pct: 76.5 } }, money)[3]
    expect(slide.title).toBe('Shopping')
    expect(slide.body).toBe('77% of your spending went here. One more thing never hurt anyone. Probably.')
  })

  it('never uses an em dash', () => {
    for (const s of recapSlides(recap, money)) expect(`${s.title}${s.body}`).not.toContain('—')
  })
})
