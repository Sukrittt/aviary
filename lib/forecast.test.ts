import { describe, it, expect } from 'vitest'
import { forecast, type ForecastInput, type ForecastExpense } from './forecast'

const round2 = (n: number) => Math.round(n * 100) / 100
const env = (category: string, available: number, isCreditCardPayment = false) => ({ category, available, isCreditCardPayment })

/** `perDay` spent in `category` on every day of `month` ('YYYY-MM'). */
function dailySpend(category: string, month: string, perDay: number, extra: Partial<ForecastExpense> = {}): ForecastExpense[] {
  const [y, m] = month.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: days }, (_, i) => ({
    date: `${month}-${String(i + 1).padStart(2, '0')}`,
    amount_inr: perDay,
    category,
    ...extra,
  }))
}

/** Jul, Aug, Sep 2026 have 31 + 31 + 30 = 92 days. */
const threeMonths = (category: string, perDay: number) => [
  ...dailySpend(category, '2026-07', perDay),
  ...dailySpend(category, '2026-08', perDay),
  ...dailySpend(category, '2026-09', perDay),
]

function input(over: Partial<ForecastInput>): ForecastInput {
  return {
    today: '2026-10-19',
    envelopes: [],
    expenses: [],
    recurringExpenses: [],
    subscriptions: [],
    recurringIncomes: [],
    ...over,
  }
}

describe('forecast', () => {
  // After the 19th, Jul has 12 days, Aug 12, Sep 11: at 100/day that's 1200, 1200, 1100,
  // so the usual rest of the month is 3500 / 3 and usual daily is that over Oct's 12 days left.
  const REST = 3500 / 3

  it('subtracts what prior months usually spent from tomorrow to month end (Oct 19: 12 days left)', () => {
    const f = forecast(input({ envelopes: [env('Food', 5000)], expenses: threeMonths('Food', 100) }))
    expect(f.basis).toBe('history')
    expect(f.daysLeft).toBe(12)
    expect(f.envelopes[0]).toMatchObject({ category: 'Food', available: 5000, usualDaily: 97.22, scheduled: 0, projected: 3833.33, runsOutOn: null })
    expect(f.totalLeft).toBe(round2(5000 - REST))
  })

  it('compares by the same day of the month, like pace.ts, so a bill already paid this month isn’t counted again', () => {
    const expenses: ForecastExpense[] = [
      ...['07', '08', '09'].map((m) => ({ date: `2026-${m}-10`, amount_inr: 1800, category: 'Power' })),
      ...['07', '08', '09'].map((m) => ({ date: `2026-${m}-25`, amount_inr: 1200, category: 'Fun' })),
      { date: '2026-06-25', amount_inr: 99999, category: 'Fun' }, // four months back: outside the window
    ]
    const f = forecast(input({ envelopes: [env('Power', 700), env('Fun', 3000)], expenses }))
    expect(f.envelopes.find((e) => e.category === 'Power')).toMatchObject({ usualDaily: 0, projected: 700 })
    expect(f.envelopes.find((e) => e.category === 'Fun')).toMatchObject({ usualDaily: 100, projected: 1800 })
  })

  it('leaves auto-added recurring and subscription entries out of usual spend', () => {
    const expenses = [
      ...threeMonths('Food', 100),
      ...dailySpend('Food', '2026-08', 500, { source: 'recurring' }),
      ...dailySpend('Food', '2026-09', 500, { source: 'subscription' }),
      // Rows written before `source` existed only carry the auto-added note.
      { date: '2026-09-10', amount_inr: 9000, category: 'Food', notes: 'Auto-added from recurring expense · rent' },
      { date: '2026-09-11', amount_inr: 9000, category: 'Food', notes: 'Auto-added from subscription' },
    ]
    const f = forecast(input({ envelopes: [env('Food', 5000)], expenses }))
    expect(f.envelopes[0].usualDaily).toBe(97.22)
  })

  it('ignores refunds and income/credit-card sentinel rows in usual spend, like pace.ts', () => {
    const expenses = [
      ...threeMonths('Food', 100),
      { date: '2026-09-12', amount_inr: -5000, category: 'Food' },
      { date: '2026-09-22', amount_inr: -5000, category: 'Food' },
      { date: '2026-09-22', amount_inr: 5000, category: '__income__' },
    ]
    const f = forecast(input({ envelopes: [env('Food', 5000)], expenses }))
    expect(f.envelopes[0].usualDaily).toBe(97.22)
  })

  it('subtracts recurring expenses still to run this month, including a missed past date', () => {
    const f = forecast(
      input({
        envelopes: [env('Rent', 30000), env('Gym', 3000)],
        expenses: threeMonths('Food', 1),
        recurringExpenses: [
          { category: 'Rent', amount_inr: 25000, frequency: 'monthly', start_date: '2026-01-28', end_date: '', next_run_date: '2026-10-28', status: 'active' },
          // Cron missed the 15th: it still owes that one, plus the 22nd and the 29th.
          { category: 'Gym', amount_inr: 500, frequency: 'weekly', start_date: '2026-10-01', end_date: '', next_run_date: '2026-10-15', status: 'active' },
          { category: 'Gym', amount_inr: 9999, frequency: 'weekly', start_date: '2026-10-01', end_date: '', next_run_date: '2026-10-20', status: 'paused' },
        ],
      }),
    )
    expect(f.envelopes.find((e) => e.category === 'Rent')).toMatchObject({ scheduled: 25000, projected: 5000 })
    expect(f.envelopes.find((e) => e.category === 'Gym')).toMatchObject({ scheduled: 1500, projected: 1500 })
  })

  it('stops a recurring expense at its end date', () => {
    const f = forecast(
      input({
        envelopes: [env('Gym', 3000)],
        expenses: threeMonths('Food', 1),
        recurringExpenses: [
          { category: 'Gym', amount_inr: 500, frequency: 'weekly', start_date: '2026-10-01', end_date: '2026-10-25', next_run_date: '2026-10-22', status: 'active' },
        ],
      }),
    )
    expect(f.envelopes[0].scheduled).toBe(500)
  })

  it('subtracts subscription charges due by month end, skipping inactive, one-time and already-charged ones', () => {
    const f = forecast(
      input({
        envelopes: [env('Fun', 2000)],
        expenses: [
          ...threeMonths('Food', 1),
          // Netflix's charge for today already went in.
          { date: '2026-10-19', amount_inr: 649, category: 'Fun', source: 'subscription', client_id: 'sub:Netflix:2026-10-19' },
        ],
        subscriptions: [
          { service: 'Spotify', category: 'Fun', amount_inr: 119, billing_cycle: 'monthly', next_due_date: '2026-10-25', status: 'active' },
          { service: 'Netflix', category: 'Fun', amount_inr: 649, billing_cycle: 'monthly', next_due_date: '2026-10-19', status: 'active' },
          { service: 'YouTube', category: 'Fun', amount_inr: 189, billing_cycle: 'monthly', next_due_date: '2026-10-19', status: 'active' },
          { service: 'Hotstar', category: 'Fun', amount_inr: 299, billing_cycle: 'monthly', next_due_date: '2026-10-26', status: 'cancelled' },
          { service: 'Course', category: 'Fun', amount_inr: 999, billing_cycle: 'one-time', next_due_date: '2026-10-26', status: 'active' },
          { service: 'Domain', category: 'Fun', amount_inr: 800, billing_cycle: 'yearly', next_due_date: '2026-11-02', status: 'active' },
        ],
      }),
    )
    // Spotify 119 + YouTube (due today, not charged yet) 189.
    expect(f.envelopes[0].scheduled).toBe(308)
  })

  it('rolls a stale subscription due date forward before counting it', () => {
    const f = forecast(
      input({
        envelopes: [env('Fun', 2000)],
        expenses: threeMonths('Food', 1),
        subscriptions: [{ service: 'Spotify', category: 'Fun', amount_inr: 119, billing_cycle: 'monthly', next_due_date: '2026-06-25', status: 'active' }],
      }),
    )
    expect(f.envelopes[0].scheduled).toBe(119)
  })

  it('gives the date an envelope crosses zero before month end', () => {
    // 1000 at 97.22/day: 27.8 left on the 29th, below zero on the 30th.
    const f = forecast(input({ envelopes: [env('Food', 1000)], expenses: threeMonths('Food', 100) }))
    expect(f.envelopes[0]).toMatchObject({ projected: round2(1000 - REST), runsOutOn: '2026-10-30' })
  })

  it('counts a scheduled charge on its own day when finding the run-out date', () => {
    const f = forecast(
      input({
        envelopes: [env('Rent', 20000)],
        expenses: threeMonths('Food', 1),
        recurringExpenses: [
          { category: 'Rent', amount_inr: 25000, frequency: 'monthly', start_date: '2026-01-28', end_date: '', next_run_date: '2026-10-28', status: 'active' },
        ],
      }),
    )
    expect(f.envelopes[0].runsOutOn).toBe('2026-10-28')
  })

  it('marks an already overspent envelope as over, with no run-out date', () => {
    const f = forecast(input({ envelopes: [env('Food', -300)], expenses: threeMonths('Food', 100) }))
    expect(f.envelopes[0]).toMatchObject({ overspent: true, runsOutOn: null, projected: round2(-300 - REST) })
  })

  it('treats rollover as already inside available', () => {
    const f = forecast(input({ envelopes: [env('Travel', 12000)], expenses: threeMonths('Food', 1) }))
    expect(f.envelopes[0]).toMatchObject({ usualDaily: 0, projected: 12000, runsOutOn: null })
  })

  it('keeps an envelope with no spending at what it has', () => {
    const f = forecast(input({ envelopes: [env('Gifts', 0)], expenses: threeMonths('Food', 1) }))
    expect(f.envelopes[0]).toMatchObject({ projected: 0, runsOutOn: null, overspent: false })
  })

  it('leaves credit-card payment envelopes out, like the widget', () => {
    const f = forecast(input({ envelopes: [env('Food', 5000), env('HDFC card', 9000, true)], expenses: threeMonths('Food', 100) }))
    expect(f.envelopes.map((e) => e.category)).toEqual(['Food'])
    expect(f.totalLeft).toBe(round2(5000 - REST))
  })

  it('on the last day of the month only subtracts what is still due today', () => {
    const f = forecast(
      input({
        today: '2026-10-31',
        envelopes: [env('Food', 500)],
        expenses: threeMonths('Food', 100),
        recurringExpenses: [
          { category: 'Food', amount_inr: 200, frequency: 'monthly', start_date: '2026-01-31', end_date: '', next_run_date: '2026-10-31', status: 'active' },
        ],
      }),
    )
    expect(f.daysLeft).toBe(0)
    expect(f.envelopes[0]).toMatchObject({ scheduled: 200, projected: 300, runsOutOn: null })
  })

  it('sums every envelope into the total, overspent ones included', () => {
    const f = forecast(input({ envelopes: [env('Food', 5000), env('Fun', -100)], expenses: threeMonths('Food', 100) }))
    expect(f.totalLeft).toBe(round2(4900 - REST))
  })

  describe('short history', () => {
    it('falls back to this month’s own pace with under a full month of history', () => {
      // First expense on Sep 20: September is partial, so no prior month counts.
      const expenses = [...dailySpend('Food', '2026-09', 999).slice(19), ...dailySpend('Food', '2026-10', 50).slice(0, 19)]
      const f = forecast(input({ envelopes: [env('Food', 2000)], expenses }))
      expect(f.basis).toBe('thisMonth')
      expect(f.envelopes[0]).toMatchObject({ usualDaily: 50, projected: 1400 })
    })

    it('counts a first month that starts in its first week', () => {
      const expenses = [...dailySpend('Food', '2026-09', 100).slice(6)] // from Sep 7; Sep 20–30 is 1100
      const f = forecast(input({ envelopes: [env('Food', 2000)], expenses }))
      expect(f.basis).toBe('history')
      expect(f.envelopes[0]).toMatchObject({ usualDaily: 91.67, projected: 900 })
    })

    it('hides the forecast before a week of this month’s own spending', () => {
      const f = forecast(input({ today: '2026-10-05', envelopes: [env('Food', 2000)], expenses: dailySpend('Food', '2026-10', 50).slice(0, 5) }))
      expect(f.basis).toBeNull()
      expect(f.envelopes).toEqual([])
      expect(f.totalLeft).toBeNull()
    })

    it('paces a mid-month newcomer over the days since their first expense, not since the 1st', () => {
      // Joined Oct 5 and spends 100 a day: 15 days of data.
      const f = forecast(input({ envelopes: [env('Food', 2000)], expenses: dailySpend('Food', '2026-10', 100).slice(4, 19) }))
      expect(f.basis).toBe('thisMonth')
      expect(f.envelopes[0]).toMatchObject({ usualDaily: 100, projected: 800 })
    })

    it('hides the forecast for a newcomer with under a week of spending, even late in the month', () => {
      const f = forecast(input({ envelopes: [env('Food', 2000)], expenses: dailySpend('Food', '2026-10', 100).slice(16, 19) }))
      expect(f.basis).toBeNull()
    })

    it('hides the forecast with no spending at all', () => {
      const f = forecast(input({ envelopes: [env('Food', 2000)] }))
      expect(f.basis).toBeNull()
    })
  })

  describe('next month', () => {
    it('is recurring income minus the recurring expenses and subscriptions due next month', () => {
      const f = forecast(
        input({
          recurringIncomes: [
            { amount: 80000, frequency: 'monthly', start_date: '2026-01-01', end_date: '', next_run_date: '2026-11-01', status: 'active' },
            { amount: 5000, frequency: 'monthly', start_date: '2026-01-01', end_date: '', next_run_date: '2026-11-01', status: 'paused' },
          ],
          recurringExpenses: [
            { category: 'Rent', amount_inr: 25000, frequency: 'monthly', start_date: '2026-01-28', end_date: '', next_run_date: '2026-10-28', status: 'active' },
            // Every Thursday in November 2026: 5, 12, 19, 26.
            { category: 'Gym', amount_inr: 500, frequency: 'weekly', start_date: '2026-10-01', end_date: '', next_run_date: '2026-10-22', status: 'active' },
          ],
          subscriptions: [
            { service: 'Spotify', category: 'Fun', amount_inr: 119, billing_cycle: 'monthly', next_due_date: '2026-10-25', status: 'active' },
            { service: 'Domain', category: '', amount_inr: 800, billing_cycle: 'yearly', next_due_date: '2026-11-02', status: 'active' },
            { service: 'Hotstar', category: 'Fun', amount_inr: 299, billing_cycle: 'monthly', next_due_date: '2026-11-26', status: 'paused' },
          ],
        }),
      )
      expect(f.nextMonth).toEqual({ month: '2026-11', income: 80000, spokenFor: 25000 + 2000 + 119 + 800, free: 80000 - 27919 })
    })

    it('is shown even when there is not enough history for this month', () => {
      const f = forecast(
        input({
          recurringExpenses: [
            { category: 'Rent', amount_inr: 25000, frequency: 'monthly', start_date: '2026-01-28', end_date: '', next_run_date: '2026-10-28', status: 'active' },
          ],
        }),
      )
      expect(f.basis).toBeNull()
      expect(f.nextMonth.spokenFor).toBe(25000)
    })

    it('rolls December into January', () => {
      const f = forecast(
        input({
          today: '2026-12-10',
          recurringExpenses: [
            { category: 'Rent', amount_inr: 100, frequency: 'monthly', start_date: '2026-01-05', end_date: '', next_run_date: '2027-01-05', status: 'active' },
          ],
        }),
      )
      expect(f.nextMonth).toMatchObject({ month: '2027-01', spokenFor: 100 })
    })
  })
})
