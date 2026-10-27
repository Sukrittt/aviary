import { describe, expect, it } from 'vitest'
import { goalLine, goalProgress, goalTemplate, nextGoalMonth } from './goal'

// `available` is the envelope's balance this month, carry and this month's
// assigned included (computeEnvelopeState). `assigned` is this month's plan.
const base = { month: '2026-10', available: 0, assigned: 0, spent: 0 }

describe('goalProgress', () => {
  it('spreads what is left over the months to the deadline, counting this one', () => {
    // 6,000 already in from earlier months, 4 months (Oct..Jan) for the other 18,000.
    const p = goalProgress({ ...base, goal: { amount: 24000, by: '2027-01' }, available: 6000 })!
    expect(p.monthlyNeed).toBe(4500)
    expect(p.status).toBe('behind')
    expect(p.behindBy).toBe(4500)
    expect(p.saved).toBe(6000)
    expect(p.pct).toBe(25)
  })

  it('rounds the monthly amount up, so paying it always makes it', () => {
    expect(goalProgress({ ...base, goal: { amount: 10000, by: '2026-12' } })!.monthlyNeed).toBe(3334)
  })

  it('stays on track once the suggestion is assigned, without moving the suggestion', () => {
    // The tap sets assigned to 4,500, which also lands in available.
    const p = goalProgress({ ...base, goal: { amount: 24000, by: '2027-01' }, available: 10500, assigned: 4500 })!
    expect(p.monthlyNeed).toBe(4500)
    expect(p.status).toBe('onTrack')
    expect(p.behindBy).toBeUndefined()
  })

  it('is behind by only the gap when some of the monthly amount is assigned', () => {
    const p = goalProgress({ ...base, goal: { amount: 24000, by: '2027-01' }, available: 9000, assigned: 3000 })!
    expect(p.status).toBe('behind')
    expect(p.behindBy).toBe(1500)
  })

  it('asks for the whole gap when the deadline is this month', () => {
    const p = goalProgress({ ...base, goal: { amount: 10000, by: '2026-10' }, available: 6000, assigned: 2000 })!
    expect(p.monthlyNeed).toBe(6000)
    expect(p.behindBy).toBe(4000)
  })

  it('is funded once the balance reaches the target', () => {
    const p = goalProgress({ ...base, goal: { amount: 10000, by: '2027-01' }, available: 12000 })!
    expect(p.status).toBe('funded')
    expect(p.pct).toBe(100)
    expect(p.monthlyNeed).toBeUndefined()
  })

  it('counts an overspent envelope as owing more, with an empty bar', () => {
    // -2,000 to cover first, so 14,000 over Oct..Dec.
    const p = goalProgress({ ...base, goal: { amount: 12000, by: '2026-12' }, available: -2000 })!
    expect(p.pct).toBe(0)
    expect(p.monthlyNeed).toBe(4667)
    expect(p.status).toBe('behind')
  })

  it('counts spending this month against the goal', () => {
    // 8,000 carried in, 3,000 spent this month: 5,000 left, 15,000 to go over Oct..Dec.
    expect(goalProgress({ ...base, goal: { amount: 20000, by: '2026-12' }, available: 5000, spent: 3000 })!.monthlyNeed).toBe(5000)
  })

  it('is done once a one-off deadline has passed without being funded', () => {
    const p = goalProgress({ ...base, goal: { amount: 30000, by: '2026-08' }, available: 1000 })!
    expect(p.status).toBe('done')
    expect(p.monthlyNeed).toBeUndefined()
  })

  it('stays funded after a passed deadline if the money is still there', () => {
    expect(goalProgress({ ...base, goal: { amount: 30000, by: '2026-08' }, available: 30000 })!.status).toBe('funded')
  })

  it('is done when it was funded and then spent this month', () => {
    // 30,000 saved for Diwali, 28,000 of it spent in the Diwali month.
    const p = goalProgress({ ...base, goal: { amount: 30000, by: '2026-10' }, available: 2000, spent: 28000 })!
    expect(p.status).toBe('done')
  })

  it('is not done when the spending came before it was ever funded', () => {
    expect(goalProgress({ ...base, goal: { amount: 30000, by: '2026-10' }, available: 2000, spent: 5000 })!.status).toBe('behind')
  })

  it('restarts a yearly goal for next year once its month has passed', () => {
    // Insurance due every March. In October 2026 the next one is March 2027: Oct..Mar is 6 months.
    const p = goalProgress({ ...base, goal: { amount: 18000, by: '2026-03', repeat: 'yearly' } })!
    expect(p.by).toBe('2027-03')
    expect(p.monthlyNeed).toBe(3000)
    expect(p.status).toBe('behind')
  })

  it('rolls a yearly goal forward as many years as it takes', () => {
    expect(goalProgress({ ...base, goal: { amount: 12000, by: '2024-03', repeat: 'yearly' } })!.by).toBe('2027-03')
  })

  it('keeps a yearly goal on this year while its month is still running', () => {
    const p = goalProgress({ ...base, goal: { amount: 30000, by: '2026-10', repeat: 'yearly' }, available: 2000, spent: 28000 })!
    expect(p.by).toBe('2026-10')
    expect(p.status).toBe('done')
  })

  it('counts only the months left for a category made mid-year', () => {
    // Made in September for a November Diwali: 3 months, not the 11 since January.
    const p = goalProgress({ ...base, month: '2026-09', goal: { amount: 30000, by: '2026-11' } })!
    expect(p.monthlyNeed).toBe(10000)
  })

  it('has no goal in the months before a re-created category came back', () => {
    expect(goalProgress({ ...base, goal: { amount: 30000, by: '2026-12' }, since: '2026-11' })).toBeNull()
  })

  it('starts a re-created category from its own month', () => {
    const p = goalProgress({ ...base, month: '2026-11', goal: { amount: 30000, by: '2026-12' }, since: '2026-11' })!
    expect(p.monthlyNeed).toBe(15000)
  })

  describe('without a deadline', () => {
    it('says when the current monthly amount gets there', () => {
      // 5,000 from before plus 5,000 a month from October: the 11th, in August 2027, makes 60,000.
      const p = goalProgress({ ...base, goal: { amount: 60000 }, available: 10000, assigned: 5000 })!
      expect(p.status).toBe('saving')
      expect(p.paceMonth).toBe('2027-08')
      expect(p.monthlyNeed).toBeUndefined()
    })

    it('says next month when one more monthly amount covers it', () => {
      expect(goalProgress({ ...base, goal: { amount: 10000 }, available: 9000, assigned: 5000 })!.paceMonth).toBe('2026-11')
    })

    it('has no date while nothing is assigned', () => {
      expect(goalProgress({ ...base, goal: { amount: 60000 }, available: 10000 })!.paceMonth).toBeNull()
    })

    it('is funded at the target', () => {
      expect(goalProgress({ ...base, goal: { amount: 60000 }, available: 60000 })!.status).toBe('funded')
    })
  })
})

describe('nextGoalMonth', () => {
  it('moves a deadline a year on', () => {
    expect(nextGoalMonth('2026-11', '2026-12')).toBe('2027-11')
  })

  it('lands on the first one still ahead', () => {
    expect(nextGoalMonth('2024-03', '2026-10')).toBe('2027-03')
  })
})

describe('goalLine', () => {
  const money = (n: number) => `₹${n.toLocaleString('en-IN')}`
  const line = (input: Parameters<typeof goalProgress>[0]) => goalLine(goalProgress(input)!, money)

  it('says how much a month makes the deadline, and how far behind this month is', () => {
    expect(line({ ...base, goal: { amount: 24000, by: '2027-01' }, available: 9000, assigned: 3000 })).toBe('Behind by ₹1,500 · ₹4,500/mo to make it by Jan 2027')
  })

  it('says on track once the monthly amount is assigned', () => {
    expect(line({ ...base, goal: { amount: 24000, by: '2027-01' }, available: 10500, assigned: 4500 })).toBe('On track · ₹4,500/mo to make it by Jan 2027')
  })

  it('says when the current pace gets there without a deadline', () => {
    expect(line({ ...base, goal: { amount: 60000 }, available: 10000, assigned: 5000 })).toBe('At this pace, by Aug 2027')
    expect(line({ ...base, goal: { amount: 60000 }, available: 10000 })).toBe('Assign a monthly amount to see when')
  })

  it('names funded and done plainly', () => {
    expect(line({ ...base, goal: { amount: 100 }, available: 100 })).toBe('Funded')
    expect(line({ ...base, goal: { amount: 100, by: '2026-01' } })).toBe('Done')
  })
})

describe('goalTemplate', () => {
  it('sets Diwali for next October, every year', () => {
    expect(goalTemplate('diwali', '2026-10')).toEqual({ name: 'Diwali', by: '2027-10', yearly: true })
    expect(goalTemplate('diwali', '2027-03')).toEqual({ name: 'Diwali', by: '2027-10', yearly: true })
  })

  it('sets insurance a year out, every year', () => {
    expect(goalTemplate('insurance', '2026-10')).toEqual({ name: 'Insurance', by: '2027-10', yearly: true })
  })

  it('gives an emergency fund no deadline', () => {
    expect(goalTemplate('emergency', '2026-10')).toEqual({ name: 'Emergency fund', by: '', yearly: false })
  })
})
