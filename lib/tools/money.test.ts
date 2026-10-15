import { describe, expect, it } from 'vitest'
import { emergencyFund, lakhs, rentAffordability, salaryPlan, sinkingFund, split503020 } from './money'

describe('lakhs', () => {
  it('says round salaries the way people say them', () => {
    expect(lakhs(25000)).toBe('₹25k')
    expect(lakhs(40000)).toBe('₹40k')
    expect(lakhs(100000)).toBe('₹1 lakh')
    expect(lakhs(250000)).toBe('₹2.5 lakh')
    expect(lakhs(12000000)).toBe('₹1.2 crore')
  })

  it('falls back to Indian digit grouping for anything else', () => {
    expect(lakhs(37850)).toBe('₹37,850')
    expect(lakhs(999)).toBe('₹999')
  })
})

describe('split503020', () => {
  it('splits take-home pay 50/30/20', () => {
    expect(split503020(60000)).toEqual({ needs: 30000, wants: 18000, savings: 12000 })
  })

  it('rounds to whole rupees and never loses a rupee', () => {
    const s = split503020(33333)
    expect(s).toEqual({ needs: 16667, wants: 10000, savings: 6666 })
    expect(s.needs + s.wants + s.savings).toBe(33333)
  })

  it('treats nothing, negatives and junk as zero', () => {
    expect(split503020(0)).toEqual({ needs: 0, wants: 0, savings: 0 })
    expect(split503020(-5000)).toEqual({ needs: 0, wants: 0, savings: 0 })
    expect(split503020(Number.NaN)).toEqual({ needs: 0, wants: 0, savings: 0 })
  })
})

describe('salaryPlan', () => {
  it('gives every rupee of the salary a category, in ₹100 steps with the remainder saved', () => {
    for (const salary of [25000, 40000, 60000, 100000, 47350]) {
      const plan = salaryPlan(salary)
      expect(plan.reduce((sum, c) => sum + c.amount, 0)).toBe(salary)
      for (const c of plan.slice(0, -1)) expect(c.amount % 100).toBe(0)
    }
  })

  it('caps rent at 30% when nothing is entered, and uses the real rent when it is', () => {
    expect(salaryPlan(40000).find((c) => c.name === 'Rent')?.amount).toBe(12000)
    expect(salaryPlan(40000, { rent: 9000 }).find((c) => c.name === 'Rent')?.amount).toBe(9000)
  })

  it('keeps needs, wants and savings near 50/30/20', () => {
    const plan = salaryPlan(60000)
    const total = (group: string) => plan.filter((c) => c.group === group).reduce((s, c) => s + c.amount, 0)
    expect(total('needs')).toBe(30000)
    expect(total('wants')).toBe(18000)
    expect(total('savings')).toBe(12000)
  })

  it('takes from wants, then savings, when rent eats more than half the needs', () => {
    const plan = salaryPlan(25000, { rent: 14000 })
    expect(plan.reduce((s, c) => s + c.amount, 0)).toBe(25000)
    expect(plan.every((c) => c.amount >= 0)).toBe(true)
    expect(plan.find((c) => c.name === 'Rent')?.amount).toBe(14000)
  })

  it('never plans a negative category, even when rent is more than the salary', () => {
    const plan = salaryPlan(20000, { rent: 30000 })
    expect(plan.every((c) => c.amount >= 0)).toBe(true)
    expect(plan.find((c) => c.name === 'Rent')?.amount).toBe(20000)
    expect(plan.reduce((s, c) => s + c.amount, 0)).toBe(20000)
  })
})

describe('emergencyFund', () => {
  it('targets six months of essentials by default', () => {
    expect(emergencyFund({ monthlyEssentials: 30000 })).toEqual({ target: 180000, gap: 180000, monthsToGoal: null })
  })

  it('counts what you have and how fast you save', () => {
    expect(emergencyFund({ monthlyEssentials: 30000, months: 3, saved: 40000, monthlySaving: 10000 }))
      .toEqual({ target: 90000, gap: 50000, monthsToGoal: 5 })
  })

  it('rounds a part month up', () => {
    expect(emergencyFund({ monthlyEssentials: 20000, saved: 0, monthlySaving: 7000 }).monthsToGoal).toBe(18)
  })

  it('is done when savings already cover it', () => {
    expect(emergencyFund({ monthlyEssentials: 20000, saved: 150000, monthlySaving: 5000 })).toEqual({ target: 120000, gap: 0, monthsToGoal: 0 })
  })
})

describe('rentAffordability', () => {
  it('suggests 25% as comfortable and 30% as the stretch, in ₹500 steps', () => {
    expect(rentAffordability({ salary: 60000 })).toEqual({ comfortable: 15000, stretch: 18000 })
    expect(rentAffordability({ salary: 47000 })).toEqual({ comfortable: 11500, stretch: 14000 })
  })

  it('shrinks when EMIs already take a big share', () => {
    // Rent plus EMIs stays within 40% of take-home.
    expect(rentAffordability({ salary: 60000, emis: 12000 })).toEqual({ comfortable: 12000, stretch: 12000 })
  })

  it('is zero, not negative, when EMIs already take 40% or more', () => {
    expect(rentAffordability({ salary: 50000, emis: 25000 })).toEqual({ comfortable: 0, stretch: 0 })
  })
})

describe('sinkingFund', () => {
  it('splits each cost over the months until it’s due, rounded up to ₹100, and totals the set-asides', () => {
    expect(sinkingFund([
      { amount: 18000, months: 12 },
      { amount: 15000, months: 8 },
      { amount: 9000, months: 6 },
    ])).toEqual({ monthly: [1500, 1900, 1500], total: 4900 })
  })

  it('never sets aside less than the cost by its due date', () => {
    const { monthly } = sinkingFund([{ amount: 24001, months: 18 }])
    expect(monthly[0]).toBe(1400)
    expect(monthly[0] * 18).toBeGreaterThanOrEqual(24001)
  })

  it('treats a cost due now, or junk months, as due in one month', () => {
    for (const months of [0, -3, 0.5, Number.NaN]) expect(sinkingFund([{ amount: 5000, months }]).monthly).toEqual([5000])
  })

  it('ignores empty and negative amounts', () => {
    expect(sinkingFund([{ amount: 0, months: 12 }, { amount: -500, months: 2 }])).toEqual({ monthly: [0, 0], total: 0 })
    expect(sinkingFund([])).toEqual({ monthly: [], total: 0 })
  })
})
