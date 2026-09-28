import { describe, expect, it } from 'vitest'
import type { BillingSubscriptionDoc } from './records'
import {
  istMonthStart,
  medianDaysToConvert,
  monthlyMovements,
  monthlyValue,
  movement,
  mrrSeries,
  payersAt,
  periodOf,
  retention,
  summarize,
  trialCohorts,
} from './revenue'

const DAY = 86400000
const NOW = new Date('2026-09-28T06:30:00Z') // 12:00 IST
const ago = (d: number) => new Date(NOW.getTime() - d * DAY)
const ahead = (d: number) => new Date(NOW.getTime() + d * DAY)
const PRICES = { monthly: 9900, yearly: 99900 } // ₹99 / ₹999

function sub(over: Partial<BillingSubscriptionDoc> = {}): BillingSubscriptionDoc {
  return {
    userId: 'u1',
    environment: 'production',
    store: 'web',
    productId: 'plan_abc',
    basePlanId: 'monthly',
    status: 'active',
    autoRenew: true,
    expiresAt: ahead(20),
    createdAt: ago(10),
    ...over,
  } as BillingSubscriptionDoc
}

describe('periodOf', () => {
  it('reads Razorpay and common Play base plan names', () => {
    expect(periodOf({ productId: 'plan_x', basePlanId: 'monthly' })).toBe('monthly')
    expect(periodOf({ productId: 'plan_x', basePlanId: 'yearly' })).toBe('yearly')
    expect(periodOf({ productId: 'aviary_pro:annual', basePlanId: null })).toBe('yearly')
    expect(periodOf({ productId: 'aviary_pro', basePlanId: 'p1m' })).toBe('monthly')
  })

  it('leaves an unrecognised plan unpriced', () => {
    expect(periodOf({ productId: 'aviary_pro', basePlanId: 'weekly' })).toBeNull()
  })
})

describe('monthlyValue', () => {
  it('spreads a yearly price over 12 months', () => {
    expect(monthlyValue('monthly', PRICES)).toBe(9900)
    expect(monthlyValue('yearly', PRICES)).toBeCloseTo(8325)
    expect(monthlyValue(null, PRICES)).toBe(0)
    expect(monthlyValue('monthly', null)).toBe(0)
  })
})

describe('payersAt', () => {
  it('skips sandbox, pending, refunded and out-of-window rows', () => {
    const subs = [
      sub({ userId: 'a' }),
      sub({ userId: 'b', environment: 'sandbox' }),
      sub({ userId: 'c', status: 'pending', expiresAt: null }),
      sub({ userId: 'd', status: 'revoked' }),
      sub({ userId: 'e', expiresAt: ago(1) }),
      sub({ userId: 'f', createdAt: ahead(1) }),
    ]
    expect([...payersAt(subs, NOW, PRICES).keys()]).toEqual(['a'])
  })

  it('counts a user with two covering rows once, by the longer one', () => {
    const subs = [sub({ basePlanId: 'monthly' }), sub({ basePlanId: 'yearly', expiresAt: ahead(300) })]
    const payers = payersAt(subs, NOW, PRICES)
    expect(payers.size).toBe(1)
    expect(payers.get('u1')?.period).toBe('yearly')
  })

  it('keeps an expired-but-paid-through row: cancelled still counts until expiry', () => {
    expect(payersAt([sub({ status: 'cancelled', autoRenew: false })], NOW, PRICES).size).toBe(1)
  })
})

describe('summarize', () => {
  it('adds up MRR, ARR, mix, fees and risk', () => {
    const subs = [
      sub({ userId: 'a', store: 'web', basePlanId: 'monthly', expiresAt: ahead(5) }),
      sub({ userId: 'b', store: 'play', productId: 'pro', basePlanId: 'yearly', expiresAt: ahead(200) }),
      sub({ userId: 'c', store: 'web', status: 'cancelled', autoRenew: false }),
      sub({ userId: 'd', store: 'play', productId: 'pro', basePlanId: 'monthly', status: 'grace' }),
      sub({ userId: 'e', productId: 'pro', basePlanId: 'weekly' }),
    ]
    const s = summarize(subs, NOW, PRICES)
    expect(s.payers).toBe(5)
    expect(s.mrr).toBeCloseTo(9900 * 3 + 8325)
    expect(s.arr).toBeCloseTo(s.mrr * 12)
    expect(s.arppu).toBeCloseTo(s.mrr / 5)
    expect(s.byPeriod.unpriced).toEqual({ n: 1, mrr: 0 })
    expect(s.byPeriod.yearly.n).toBe(1)
    expect(s.byStore.play.n).toBe(2)
    expect(s.cancelling).toEqual({ n: 1, mrr: 9900 })
    expect(s.grace).toEqual({ n: 1, mrr: 9900 })
    // Only a's monthly renews inside 30 days, at the full plan price.
    expect(s.renewals).toEqual({ n: 1, amount: 9900 })
    expect(s.netMrr).toBeCloseTo(9900 * 0.9764 * 2 + (8325 + 9900) * 0.85)
  })

  it('is all zeros with nobody paying', () => {
    const s = summarize([], NOW, PRICES)
    expect(s).toMatchObject({ mrr: 0, arr: 0, payers: 0, arppu: 0 })
  })
})

describe('mrrSeries', () => {
  it('reconstructs MRR on each past day from row spans', () => {
    const series = mrrSeries([sub({ createdAt: ago(2) })], 5, NOW, PRICES)
    expect(series).toHaveLength(5)
    expect(series.map((p) => p.payers)).toEqual([0, 0, 1, 1, 1])
    expect(series[4]).toEqual({ day: '2026-09-28', mrr: 9900, payers: 1 })
  })
})

describe('movement', () => {
  it('splits the change into new, reactivation, expansion, contraction and churn', () => {
    const from = ago(30)
    const subs = [
      // new: first ever row inside the window
      sub({ userId: 'new', createdAt: ago(3) }),
      // reactivation: paid long ago, lapsed, back now
      sub({ userId: 'back', createdAt: ago(200), expiresAt: ago(100) }),
      sub({ userId: 'back', createdAt: ago(2) }),
      // churn: paying at the start, gone now
      sub({ userId: 'gone', createdAt: ago(40), expiresAt: ago(5) }),
      // contraction: monthly to yearly (cheaper per month)
      sub({ userId: 'switch', createdAt: ago(40), expiresAt: ago(10) }),
      sub({ userId: 'switch', basePlanId: 'yearly', createdAt: ago(10), expiresAt: ahead(355) }),
      // retained, unchanged
      sub({ userId: 'stay', createdAt: ago(60) }),
    ]
    const m = movement(subs, from, NOW, PRICES)
    expect(m.new).toEqual({ n: 1, mrr: 9900 })
    expect(m.reactivation).toEqual({ n: 1, mrr: 9900 })
    expect(m.churn).toEqual({ n: 1, mrr: 9900 })
    expect(m.contraction.n).toBe(1)
    expect(m.contraction.mrr).toBeCloseTo(9900 - 8325)
    expect(m.expansion.n).toBe(0)
    expect(m.start).toEqual({ mrr: 9900 * 3, payers: 3 })
    // start + new + reactivation + expansion - contraction - churn = end
    const net = m.start.mrr + m.new.mrr + m.reactivation.mrr + m.expansion.mrr - m.contraction.mrr - m.churn.mrr
    expect(net).toBeCloseTo(m.end.mrr)
  })
})

describe('retention', () => {
  it('derives churn, net retention and LTV from a 30-day movement', () => {
    const subs = [sub({ userId: 'a', createdAt: ago(40), expiresAt: ago(1) }), sub({ userId: 'b', createdAt: ago(40) })]
    const r = retention(movement(subs, ago(30), NOW, PRICES), 30)
    expect(r.logoChurn).toBe(0.5)
    expect(r.revenueChurn).toBe(0.5)
    expect(r.netRetention).toBe(0.5)
    // ARPPU ₹99 over 50% monthly churn
    expect(r.ltv).toBe(19800)
  })

  it('has no LTV while nobody has churned, and nothing at all with no starting payers', () => {
    expect(retention(movement([sub({ createdAt: ago(40) })], ago(30), NOW, PRICES), 30).ltv).toBeNull()
    expect(retention(movement([], ago(30), NOW, PRICES), 30)).toEqual({ logoChurn: null, revenueChurn: null, netRetention: null, ltv: null })
  })
})

describe('istMonthStart', () => {
  it('returns IST month boundaries, across a year end', () => {
    expect(istMonthStart(NOW, 0).toISOString()).toBe('2026-08-31T18:30:00.000Z')
    expect(istMonthStart(NOW, 9).toISOString()).toBe('2025-11-30T18:30:00.000Z')
  })

  it('uses the IST month, not the UTC one', () => {
    // 1 Oct 01:00 IST is still 30 Sep in UTC.
    expect(istMonthStart(new Date('2026-09-30T19:30:00Z'), 0).toISOString()).toBe('2026-09-30T18:30:00.000Z')
  })
})

describe('monthlyMovements', () => {
  it('returns one movement per month, oldest first, ending now', () => {
    const rows = monthlyMovements([sub({ createdAt: ago(3) })], 3, NOW, PRICES)
    expect(rows.map((r) => r.month.toISOString())).toEqual(['2026-06-30T18:30:00.000Z', '2026-07-31T18:30:00.000Z', '2026-08-31T18:30:00.000Z'])
    expect(rows[2].new.n).toBe(1)
    expect(rows[0].new.n).toBe(0)
  })
})

describe('trialCohorts and medianDaysToConvert', () => {
  const accounts = [
    { _id: 'a', trialStartedAt: ago(20), trialEndsAt: ahead(25) }, // this month, converted early
    { _id: 'b', trialStartedAt: ago(15), trialEndsAt: ahead(30) }, // this month, still deciding
    { _id: 'c', trialStartedAt: ago(60), trialEndsAt: ago(15) }, // July, lapsed
    { _id: 'd', trialStartedAt: ago(62), trialEndsAt: ago(17) }, // July, converted
  ]
  const subs = [sub({ userId: 'a', createdAt: ago(10) }), sub({ userId: 'd', createdAt: ago(18) }), sub({ userId: 'c', environment: 'sandbox' })]

  it('counts only decided trials in the denominator', () => {
    const [jul, aug, sep] = trialCohorts(accounts, subs, 3, NOW)
    expect(jul).toMatchObject({ started: 2, decided: 2, converted: 1 })
    expect(aug).toMatchObject({ started: 0, decided: 0, converted: 0 })
    expect(sep).toMatchObject({ started: 2, decided: 1, converted: 1 })
  })

  it('finds the median days from trial start to first payment', () => {
    // a: 10 days, d: 44 days
    expect(medianDaysToConvert(accounts, subs)).toBe(27)
    expect(medianDaysToConvert(accounts, [])).toBeNull()
  })
})
