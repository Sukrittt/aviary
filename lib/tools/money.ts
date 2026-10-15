import { formatINR } from '@/src/lib/format'

/** The math behind the free /tools calculators. Whole rupees in, whole rupees out. */

const amount = (n: number | undefined) => (Number.isFinite(n) && n! > 0 ? Math.floor(n!) : 0)
const floorTo = (n: number, step: number) => Math.floor(n / step) * step
const trim = (n: number) => String(Number(n.toFixed(2)))

/** "₹25k", "₹1 lakh", "₹1.2 crore" for round numbers, "₹37,850" otherwise. */
export function lakhs(n: number): string {
  if (n >= 1e7 && n % 1e5 === 0) return `₹${trim(n / 1e7)} crore`
  if (n >= 1e5 && n % 1e4 === 0) return `₹${trim(n / 1e5)} lakh`
  if (n >= 1e3 && n < 1e5 && n % 1e3 === 0) return `₹${n / 1e3}k`
  return formatINR(n)
}

/** 50% needs, 30% wants, 20% savings. Savings takes the rounding so the parts add up. */
export function split503020(income: number) {
  const total = amount(income)
  const needs = Math.round(total * 0.5)
  const wants = Math.round(total * 0.3)
  return { needs, wants, savings: total - needs - wants }
}

export interface PlanCategory { name: string; group: 'needs' | 'wants' | 'savings'; amount: number }

/** Splits `total` by `weights` in ₹100 steps; the last part takes what's left. */
function parts(total: number, names: string[], weights: number[], group: PlanCategory['group']): PlanCategory[] {
  let left = total
  return names.map((name, i) => {
    const amt = i === names.length - 1 ? left : floorTo(total * weights[i], 100)
    left -= amt
    return { name, group, amount: amt }
  })
}

/**
 * A month's salary as categories, close to 50/30/20: rent up to 30%, other
 * needs 20%, wants 30%, savings 20%. A real rent above 30% comes out of wants
 * first and savings last; a lower one leaves the difference in savings.
 */
export function salaryPlan(salary: number, { rent }: { rent?: number } = {}): PlanCategory[] {
  const total = amount(salary)
  const rentAmt = Math.min(rent === undefined ? floorTo(total * 0.3, 100) : amount(rent), total)
  const otherNeeds = Math.min(floorTo(total * 0.2, 100), total - rentAmt)
  const savingsTarget = floorTo(total * 0.2, 100)
  const wants = Math.max(0, Math.min(floorTo(total * 0.3, 100), floorTo(total - rentAmt - otherNeeds - savingsTarget, 100)))
  const savings = total - rentAmt - otherNeeds - wants
  return [
    { name: 'Rent', group: 'needs', amount: rentAmt },
    ...parts(otherNeeds, ['Groceries', 'Bills and phone', 'Transport'], [0.5, 0.25], 'needs'),
    ...parts(wants, ['Eating out', 'Shopping', 'Fun and subscriptions'], [0.4, 0.3], 'wants'),
    ...parts(savings, ['Emergency fund', 'Investments'], [0.5], 'savings'),
  ]
}

/** `months` of essential spending (6 by default), what's still missing, and how long saving takes. */
export function emergencyFund({ monthlyEssentials, months = 6, saved = 0, monthlySaving = 0 }: { monthlyEssentials: number; months?: number; saved?: number; monthlySaving?: number }) {
  const target = amount(monthlyEssentials) * amount(months)
  const gap = Math.max(0, target - amount(saved))
  const perMonth = amount(monthlySaving)
  return { target, gap, monthsToGoal: gap === 0 ? 0 : perMonth ? Math.ceil(gap / perMonth) : null }
}

/**
 * What to put aside each month so every yearly or irregular cost is covered
 * by its due date: the cost over the months left (at least 1), rounded up to ₹100.
 */
export function sinkingFund(costs: { amount: number; months: number }[]) {
  const monthly = costs.map((c) => Math.ceil(amount(c.amount) / Math.max(1, amount(c.months)) / 100) * 100)
  return { monthly, total: monthly.reduce((sum, n) => sum + n, 0) }
}

/**
 * Rent that fits a take-home `salary`: 25% is comfortable, 30% a stretch, and
 * rent plus EMIs stays within 40%. Rounded down to ₹500, like listings are.
 */
export function rentAffordability({ salary, emis = 0 }: { salary: number; emis?: number }) {
  const total = amount(salary)
  const room = total * 0.4 - amount(emis)
  const fit = (share: number) => Math.max(0, floorTo(Math.min(total * share, room), 500))
  return { comfortable: fit(0.25), stretch: fit(0.3) }
}
