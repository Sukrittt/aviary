import { describe, expect, it } from 'vitest'
import { allowanceNote, lastWeekResults, monthWeeks, paceLine, resetChip, spendByDay, weekPace, weeklyRecap, weekResult } from './weekly'

const money = (n: number) => `₹${n.toFixed(2)}`

// Groceries in October 2026: ₹4,121.40, over in weeks 2 and 4.
function october(today: number, thisWeek: number) {
  const days = new Array(31).fill(0)
  days[0] = 400
  days[5] = 1050
  days[12] = 880
  days[19] = 1130
  days[today - 1] += thisWeek
  return weekPace(4121.4, days, '2026-10', today)
}

describe('monthWeeks', () => {
  it('starts weeks on Monday and clips them to the month', () => {
    expect(monthWeeks('2026-10').map((w) => [w.from, w.to])).toEqual([[1, 4], [5, 11], [12, 18], [19, 25], [26, 31]])
  })

  it('gives a Sunday the 1st a one-day first week', () => {
    expect(monthWeeks('2026-11')[0]).toEqual({ from: 1, to: 1, days: 1 })
  })

  it('covers every day exactly once', () => {
    for (const m of ['2026-02', '2027-02', '2026-06']) {
      expect(monthWeeks(m).reduce((s, w) => s + w.days, 0)).toBe(new Date(Number(m.slice(0, 4)), Number(m.slice(5)), 0).getDate())
    }
  })
})

describe('weekPace', () => {
  it('spreads what the month has left over the weeks left', () => {
    const p = october(26, 206.66)
    expect(p.current.allowance).toBe(661.4)
    expect(p.current.usual).toBe(797.69)
    expect(p.left).toBe(454.74)
    expect(p.weeks).toHaveLength(5)
  })

  it('is on track behind the tick, ahead past it, over past the allowance', () => {
    expect(october(29, 380).status).toBe('onTrack')
    expect(october(26, 206.66).status).toBe('ahead')
    expect(october(29, 700).status).toBe('over')
  })

  it('puts the tick at the end of today', () => {
    expect(october(29, 0).tickPct).toBeCloseTo((4 / 6) * 100)
    expect(october(31, 0).tickPct).toBe(100)
  })

  it('counts days to the reset and the daily share of what is left', () => {
    const p = october(29, 470.4)
    expect(p.daysAfterToday).toBe(2)
    expect(p.perDay).toBe(95.5)
    expect(october(31, 0).perDay).toBeNull()
  })

  it('never shows more left this week than the month has left', () => {
    const days = new Array(31).fill(0)
    days[2] = 5000
    const p = weekPace(4000, days, '2026-10', 6)
    expect(p.current.allowance).toBe(0)
    expect(p.left).toBe(-1000)
    expect(p.status).toBe('over')
  })
})

describe('month pace', () => {
  it('ticks the month bar at the end of today, and tones it by month pace', () => {
    const p = october(26, 206.66)
    expect(p.monthTickPct).toBeCloseTo((26 / 31) * 100)
    expect(p.monthSpentPct).toBeCloseTo((3666.66 / 4121.4) * 100)
    expect(p.monthStatus).toBe('ahead')
    expect(weekPace(4000, new Array(31).fill(0), '2026-10', 26).monthStatus).toBe('onTrack')
    const over = new Array(31).fill(0)
    over[0] = 4500
    expect(weekPace(4000, over, '2026-10', 26).monthStatus).toBe('over')
  })
})

describe('copy', () => {
  it('says how the week is going', () => {
    expect(paceLine(october(29, 380), money)).toBe('On track this week')
    expect(paceLine(october(29, 470.4), money)).toBe('Ahead · ₹96.00/day this week')
    expect(paceLine(october(29, 700), money)).toBe('₹38.60 over this week')
    expect(resetChip(october(29, 0))).toBe('2d left')
    expect(resetChip(october(31, 0))).toBe('Last day')
  })

  it('explains a smaller or bigger week, and stays quiet on the first', () => {
    expect(allowanceNote(october(26, 0), money)).toBe(
      "This week's ₹661.40 is ₹136.00 less than usual. It makes up for the weeks that ran over. Stay under it and you're back on pace.",
    )
    expect(allowanceNote(weekPace(3100, new Array(31).fill(0), '2026-10', 6), money)).toMatch(/more than usual, thanks to the weeks you came in under/)
    expect(allowanceNote(october(2, 0), money)).toBeNull()
  })
})

describe('lastWeekResults', () => {
  it('counts last week’s categories that stayed under, and lists the ones over', () => {
    const r = lastWeekResults([
      { category: 'Groceries', pace: october(26, 0) },
      { category: 'Eating out', pace: weekPace(2000, new Array(31).fill(0), '2026-10', 26) },
    ])
    expect(r).toMatchObject({ under: 1, total: 2, over: [{ category: 'Groceries', by: 165 }] })
  })

  it('has nothing to say in a month’s first week', () => {
    expect(lastWeekResults([{ category: 'Groceries', pace: october(2, 0) }])).toBeNull()
  })
})

describe('spendByDay', () => {
  it('buckets one category’s month by day', () => {
    const rows = [
      { date: '2026-10-05', category: 'Groceries', amount_inr: '100' },
      { date: '2026-10-05', category: 'Groceries', amount_inr: 50 },
      { date: '2026-10-06', category: 'Rent', amount_inr: '9000' },
      { date: '2026-09-30', category: 'Groceries', amount_inr: '70' },
    ]
    const d = spendByDay(rows, 'Groceries', '2026-10')
    expect(d).toHaveLength(31)
    expect(d[4]).toBe(150)
    expect(d.reduce((a, b) => a + b, 0)).toBe(150)
  })
})

describe('weeklyRecap', () => {
  const name = (c: string) => c
  const easy = weekPace(2000, new Array(31).fill(0), '2026-10', 26)

  it('leads with the win, in one short line', () => {
    const r = lastWeekResults([{ category: 'Groceries', pace: october(26, 0) }, { category: 'Eating out', pace: easy }])!
    expect(weeklyRecap(r, money, name)).toEqual({
      tone: 'good',
      title: 'Last week, done right',
      detail: '1 of 2 categories stayed under.',
    })
  })

  it('celebrates a clean sweep', () => {
    expect(weeklyRecap(lastWeekResults([{ category: 'Eating out', pace: easy }])!, money, name).detail).toBe('You stayed under.')
  })

  it('stays calm when the only category ran over', () => {
    expect(weeklyRecap(lastWeekResults([{ category: 'Groceries', pace: october(26, 0) }])!, money, name)).toEqual({
      tone: 'calm',
      title: 'Groceries ran ₹165.00 over',
      detail: 'This week covers it.',
    })
  })
})

describe('weekResult', () => {
  const p = october(26, 206.66)

  it('gives a past week what it came in under or over by, like Home’s pills', () => {
    expect(weekResult(p.weeks[0], false, p.left, money)).toEqual({ text: '₹132.00', over: false })
    expect(weekResult(p.weeks[1], false, p.left, money)).toEqual({ text: '-₹85.00', over: true })
  })

  it('gives this week what it has left, or how far over it is', () => {
    expect(weekResult(p.current, true, p.left, money)).toEqual({ text: '₹455.00', over: false })
    expect(weekResult(p.current, true, -40, money)).toEqual({ text: '-₹40.00', over: true })
  })

  it('never shows a week a few paise over as fine', () => {
    expect(weekResult({ from: 1, to: 7, days: 7, spent: 500.4, allowance: 500, usual: 500 }, false, 0, money)).toEqual({ text: '-₹0.40', over: true })
  })
})
