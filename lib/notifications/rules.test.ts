import { describe, it, expect } from 'vitest'
import { buildNotifications, categoryLevel, OVER_LEVEL, type NotificationPrefs } from './rules'
import type { Envelope } from '@/src/types/expense'
import type { SummarizeExpensesMeta } from '@/lib/ai/expenseContext'

function envelope(overrides: Partial<Envelope> = {}): Envelope {
  return {
    category: 'Food',
    group: 'Living',
    assigned: 1000,
    spent: 500,
    available: 500,
    rolledOver: 0,
    isOverspent: false,
    spentPct: 50,
    ...overrides,
  }
}

function meta(overrides: Partial<SummarizeExpensesMeta> = {}): SummarizeExpensesMeta {
  return {
    txnCountThisMonth: 5,
    totalSpent: 500,
    totalAssigned: 1000,
    daysLeft: 15,
    daysElapsed: 15,
    totalDaysInMonth: 30,
    ...overrides,
  }
}

function prefs(overrides: Partial<NotificationPrefs> = {}): NotificationPrefs {
  return {
    cadence: 'weekly',
    thresholds: true,
    bills: true,
    billLeadDays: 3,
    coach: true,
    wrapped: true,
    ...overrides,
  }
}

function isoDaysFromNow(days: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const MONTH = '2026-08'
const TODAY = '2026-08-15'

describe('buildNotifications — thresholds', () => {
  it('does not fire below any configured threshold', () => {
    const notifs = buildNotifications({
      envelopes: [envelope({ spentPct: 40 })],
      subscriptions: [],
      categories: [{ name: 'Food', alertPcts: [50, 90] }],
      meta: meta(),
      prefs: prefs({ bills: false, coach: false }),
      today: TODAY,
      month: MONTH,
    })
    expect(notifs.filter((n) => n.kind === 'threshold')).toHaveLength(0)
  })

  it('fires once exactly at a configured threshold', () => {
    const notifs = buildNotifications({
      envelopes: [envelope({ spentPct: 80, spent: 800 })],
      subscriptions: [],
      categories: [{ name: 'Food', alertPcts: [80] }],
      meta: meta(),
      prefs: prefs({ bills: false, coach: false }),
      today: TODAY,
      month: MONTH,
    })
    const thresholds = notifs.filter((n) => n.kind === 'threshold')
    expect(thresholds).toHaveLength(1)
    expect(thresholds[0].key).toBe(`thr:${MONTH}:Food:80`)
  })

  it('falls back to the default set [50, 90, 100] when a category has no alertPcts', () => {
    const notifs = buildNotifications({
      envelopes: [envelope({ spentPct: 95, spent: 950 })],
      subscriptions: [],
      categories: [],
      meta: meta(),
      prefs: prefs({ bills: false, coach: false }),
      today: TODAY,
      month: MONTH,
    })
    const thresholds = notifs.filter((n) => n.kind === 'threshold').map((n) => n.key)
    expect(thresholds).toEqual([`thr:${MONTH}:Food:90`])
  })

  it('fires only the highest crossed threshold, so one jump sends one notification', () => {
    const notifs = buildNotifications({
      envelopes: [envelope({ spentPct: 98, spent: 980 })],
      subscriptions: [],
      categories: [{ name: 'Food', alertPcts: [25, 50, 90, 100] }],
      meta: meta(),
      prefs: prefs({ bills: false, coach: false }),
      today: TODAY,
      month: MONTH,
    })
    const thresholds = notifs.filter((n) => n.kind === 'threshold')
    expect(thresholds).toHaveLength(1)
    expect(thresholds[0].key).toBe(`thr:${MONTH}:Food:90`)
  })

  it('an empty alertPcts opts a category out of threshold alerts entirely', () => {
    const notifs = buildNotifications({
      envelopes: [envelope({ spentPct: 99, spent: 990 })],
      subscriptions: [],
      categories: [{ name: 'Food', alertPcts: [] }],
      meta: meta(),
      prefs: prefs({ bills: false, coach: false }),
      today: TODAY,
      month: MONTH,
    })
    expect(notifs.filter((n) => n.kind === 'threshold')).toHaveLength(0)
  })

  it('raising a threshold mid-month produces a new key so it can fire again', () => {
    const build = (pct: number) =>
      buildNotifications({
        envelopes: [envelope({ spentPct: 90, spent: 900 })],
        subscriptions: [],
        categories: [{ name: 'Food', alertPcts: [pct] }],
        meta: meta(),
        prefs: prefs({ bills: false, coach: false }),
        today: TODAY,
        month: MONTH,
      })
    const a = build(80).find((n) => n.kind === 'threshold')
    const b = build(85).find((n) => n.kind === 'threshold')
    expect(a?.key).not.toBe(b?.key)
  })

  it('sends an overspent notification instead of a threshold one when over budget', () => {
    const notifs = buildNotifications({
      envelopes: [envelope({ spentPct: 100, spent: 1200, available: -200, isOverspent: true })],
      subscriptions: [],
      categories: [],
      meta: meta(),
      prefs: prefs({ bills: false, coach: false }),
      today: TODAY,
      month: MONTH,
    })
    expect(notifs.filter((n) => n.kind === 'threshold')).toHaveLength(0)
    const overspent = notifs.filter((n) => n.kind === 'overspent')
    expect(overspent).toHaveLength(1)
    expect(overspent[0].key).toBe(`over:${MONTH}:Food`)
  })

  it('carries the current level in data, for state-based dedupe downstream', () => {
    const notifs = buildNotifications({
      envelopes: [envelope({ spentPct: 80, spent: 800 })],
      subscriptions: [],
      categories: [{ name: 'Food', alertPcts: [80] }],
      meta: meta(),
      prefs: prefs({ bills: false, coach: false }),
      today: TODAY,
      month: MONTH,
    })
    const threshold = notifs.find((n) => n.kind === 'threshold')
    expect(threshold?.data).toMatchObject({ category: 'Food', month: MONTH, level: 80 })

    const overspent = buildNotifications({
      envelopes: [envelope({ spentPct: 100, available: -50, isOverspent: true })],
      subscriptions: [],
      categories: [],
      meta: meta(),
      prefs: prefs({ bills: false, coach: false }),
      today: TODAY,
      month: MONTH,
    }).find((n) => n.kind === 'overspent')
    expect(overspent?.data).toMatchObject({ category: 'Food', month: MONTH, level: OVER_LEVEL })
  })

  it('categoryLevel reports the current level without building a notification', () => {
    const envelopes = [envelope({ spentPct: 95, spent: 950 })]
    const categories = [{ name: 'Food', alertPcts: [50, 90] }]
    expect(categoryLevel(envelopes, categories, 'Food')).toBe(90)
    expect(categoryLevel(envelopes, categories, 'Nonexistent')).toBe(0)
    expect(categoryLevel([envelope({ spentPct: 30 })], [{ name: 'Food', alertPcts: [50, 90] }], 'Food')).toBe(0)
  })

  it('skips the credit-card sentinel envelope', () => {
    const notifs = buildNotifications({
      envelopes: [envelope({ category: '__credit_card__', isCreditCardPayment: true, spentPct: 100, isOverspent: true })],
      subscriptions: [],
      categories: [],
      meta: meta(),
      prefs: prefs({ bills: false, coach: false }),
      today: TODAY,
      month: MONTH,
    })
    expect(notifs.filter((n) => n.kind === 'threshold' || n.kind === 'overspent')).toHaveLength(0)
  })
})

describe('buildNotifications — bills', () => {
  it('fires exactly on the lead-day boundary', () => {
    const due = isoDaysFromNow(3)
    const notifs = buildNotifications({
      envelopes: [],
      subscriptions: [{ service: 'Netflix', amount_inr: 500, billing_cycle: 'monthly', next_due_date: due, status: 'active' }],
      categories: [],
      meta: meta(),
      prefs: prefs({ billLeadDays: 3 }),
      today: TODAY,
      month: MONTH,
    })
    expect(notifs.filter((n) => n.kind === 'bill')).toHaveLength(1)
  })

  it('does not fire one day past the lead-day boundary', () => {
    const due = isoDaysFromNow(4)
    const notifs = buildNotifications({
      envelopes: [],
      subscriptions: [{ service: 'Netflix', amount_inr: 500, billing_cycle: 'monthly', next_due_date: due, status: 'active' }],
      categories: [],
      meta: meta(),
      prefs: prefs({ billLeadDays: 3 }),
      today: TODAY,
      month: MONTH,
    })
    expect(notifs.filter((n) => n.kind === 'bill')).toHaveLength(0)
  })

  it('skips cancelled subscriptions', () => {
    const due = isoDaysFromNow(3)
    const notifs = buildNotifications({
      envelopes: [],
      subscriptions: [{ service: 'Netflix', amount_inr: 500, billing_cycle: 'monthly', next_due_date: due, status: 'cancelled' }],
      categories: [],
      meta: meta(),
      prefs: prefs({ billLeadDays: 3 }),
      today: TODAY,
      month: MONTH,
    })
    expect(notifs.filter((n) => n.kind === 'bill')).toHaveLength(0)
  })

  it('is suppressed by notifyBills: false', () => {
    const due = isoDaysFromNow(3)
    const notifs = buildNotifications({
      envelopes: [],
      subscriptions: [{ service: 'Netflix', amount_inr: 500, billing_cycle: 'monthly', next_due_date: due, status: 'active' }],
      categories: [],
      meta: meta(),
      prefs: prefs({ billLeadDays: 3, bills: false }),
      today: TODAY,
      month: MONTH,
    })
    expect(notifs.filter((n) => n.kind === 'bill')).toHaveLength(0)
  })
})

describe('buildNotifications — digest', () => {
  it('uses a daily key under daily cadence', () => {
    const notifs = buildNotifications({
      envelopes: [],
      subscriptions: [],
      categories: [],
      meta: meta(),
      prefs: prefs({ cadence: 'daily', bills: false, coach: false }),
      today: TODAY,
      month: MONTH,
    })
    const digest = notifs.find((n) => n.kind === 'digest')
    expect(digest?.key).toBe(`digest:${TODAY}`)
  })

  it('uses a weekly key under weekly cadence', () => {
    const notifs = buildNotifications({
      envelopes: [],
      subscriptions: [],
      categories: [],
      meta: meta(),
      prefs: prefs({ cadence: 'weekly', bills: false, coach: false }),
      today: TODAY,
      month: MONTH,
    })
    const digest = notifs.find((n) => n.kind === 'digest')
    expect(digest?.key).toMatch(/^digest:w:2026-W\d{2}$/)
  })
})

describe('buildNotifications — coach', () => {
  it('fires when spending is projected to exceed the monthly budget', () => {
    const notifs = buildNotifications({
      envelopes: [envelope({ spentPct: 50 })],
      subscriptions: [],
      categories: [],
      meta: meta({ totalSpent: 900, totalAssigned: 1000, daysElapsed: 10, totalDaysInMonth: 30 }),
      prefs: prefs({ bills: false }),
      today: TODAY,
      month: MONTH,
    })
    expect(notifs.filter((n) => n.kind === 'coach')).toHaveLength(1)
  })

  it('does not fire when on track', () => {
    const notifs = buildNotifications({
      envelopes: [envelope({ spentPct: 30, spent: 300, available: 700 })],
      subscriptions: [],
      categories: [],
      meta: meta({ totalSpent: 300, totalAssigned: 1000, daysElapsed: 15, totalDaysInMonth: 30 }),
      prefs: prefs({ bills: false }),
      today: TODAY,
      month: MONTH,
    })
    expect(notifs.filter((n) => n.kind === 'coach')).toHaveLength(0)
  })

  it('is suppressed by notifyCoach: false', () => {
    const notifs = buildNotifications({
      envelopes: [],
      subscriptions: [],
      categories: [],
      meta: meta({ totalSpent: 900, totalAssigned: 1000, daysElapsed: 10, totalDaysInMonth: 30 }),
      prefs: prefs({ bills: false, coach: false }),
      today: TODAY,
      month: MONTH,
    })
    expect(notifs.filter((n) => n.kind === 'coach')).toHaveLength(0)
  })
})

describe('buildNotifications — cadence off', () => {
  it('suppresses the digest, bills, and coach, but not category limit alerts', () => {
    const due = isoDaysFromNow(3)
    const notifs = buildNotifications({
      envelopes: [envelope({ spentPct: 100, isOverspent: true })],
      subscriptions: [{ service: 'Netflix', amount_inr: 500, billing_cycle: 'monthly', next_due_date: due, status: 'active' }],
      categories: [],
      meta: meta({ totalSpent: 900, totalAssigned: 1000, daysElapsed: 10, totalDaysInMonth: 30 }),
      prefs: prefs({ cadence: 'off' }),
      today: TODAY,
      month: MONTH,
    })
    expect(notifs.filter((n) => n.kind !== 'overspent')).toHaveLength(0)
    expect(notifs.filter((n) => n.kind === 'overspent')).toHaveLength(1)
  })
})

describe('buildNotifications — thresholds off', () => {
  it('suppresses category limit alerts regardless of cadence', () => {
    const notifs = buildNotifications({
      envelopes: [envelope({ spentPct: 95, spent: 950 }), envelope({ category: 'Rent', spentPct: 100, isOverspent: true })],
      subscriptions: [],
      categories: [],
      meta: meta(),
      prefs: prefs({ cadence: 'daily', thresholds: false, bills: false, coach: false }),
      today: TODAY,
      month: MONTH,
    })
    expect(notifs.filter((n) => n.kind === 'threshold' || n.kind === 'overspent')).toHaveLength(0)
  })
})

it('uses each user’s display currency for thresholds and digests', () => {
  const input = { envelopes: [envelope()], subscriptions: [], categories: [], meta: meta(), today: TODAY, month: MONTH }
  const usd = buildNotifications({ ...input, prefs: prefs({ currencyCode: 'USD', cadence: 'daily' }) })
  const eur = buildNotifications({ ...input, prefs: prefs({ currencyCode: 'EUR', cadence: 'daily' }) })
  expect(usd.find(n => n.kind === 'threshold')?.body).toContain('$500 of $1,000')
  expect(eur.find(n => n.kind === 'threshold')?.body).toContain('€500 of €1,000')
  expect(usd.find(n => n.kind === 'digest')?.body).toContain('$500')
  expect(input.envelopes[0].spent).toBe(500)
})

describe('buildNotifications — pace', () => {
  const pace = { category: 'Food', spent: 6200, usual: 3000, usualRest: 9300, ratio: 2.1 }
  const run = (over: Partial<Parameters<typeof buildNotifications>[0]> = {}) =>
    buildNotifications({
      envelopes: [envelope({ category: 'Food', assigned: 8000, spent: 6200, available: 1800, spentPct: 78 })],
      subscriptions: [],
      categories: [],
      meta: meta(),
      prefs: prefs({ thresholds: false, bills: false, cadence: 'weekly' }),
      today: TODAY,
      month: MONTH,
      pace,
      ...over,
    }).filter((n) => n.kind === 'pace')

  it('projects the month and suggests the envelope with the most slack', () => {
    const [n] = run({
      envelopes: [
        envelope({ category: 'Food', assigned: 8000, spent: 6200, available: 1800, spentPct: 78 }),
        envelope({ category: 'Shopping', assigned: 5000, spent: 1600, available: 3400, spentPct: 32 }),
        envelope({ category: 'Fuel', assigned: 2000, spent: 1000, available: 1000, spentPct: 50 }),
      ],
    })
    expect(n).toMatchObject({ key: `pace:${MONTH}:Food`, title: 'Food is running hot' })
    // 6,200 + 9,300 usual rest = 15,500 vs 8,000 budget: 7,500 short, capped at Shopping's 3,400.
    expect(n.body).toBe("₹6,200 so far, about 2.1× your usual pace. At this rate you'll hit ₹15,500 vs ₹8,000 budgeted. Move ₹3,400 from Shopping?")
    expect(n.data).toEqual({ route: '/modals/move-money', category: 'Food' })
  })

  it('compares with the usual amount when the category has no budget', () => {
    const [n] = run({ envelopes: [envelope({ category: 'Food', assigned: 0, spent: 6200, available: -6200 })] })
    expect(n.body).toBe("₹6,200 so far vs ₹3,000 you usually spend by now.")
    expect(n.data).toBeUndefined()
  })

  it('skips the projection when the budget still covers the usual rest of the month', () => {
    const [n] = run({ envelopes: [envelope({ category: 'Food', assigned: 20000, spent: 6200, available: 13800 })] })
    expect(n.body).toBe("₹6,200 so far vs ₹3,000 you usually spend by now.")
  })

  it('projects without a suggestion when no envelope has slack', () => {
    const [n] = run()
    expect(n.body).toBe("₹6,200 so far, about 2.1× your usual pace. At this rate you'll hit ₹15,500 vs ₹8,000 budgeted.")
    expect(n.data).toBeUndefined()
  })

  it('rides on the coach pref and the digest cadence', () => {
    expect(run({ prefs: prefs({ coach: false }) })).toHaveLength(0)
    expect(run({ prefs: prefs({ cadence: 'off' }) })).toHaveLength(0)
    expect(run({ pace: null })).toHaveLength(0)
  })
})
