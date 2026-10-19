/**
 * Month-end forecast: "will I make it to month end?" in one line. Pure, no
 * I/O; `app/api/forecast` loads the rows and both clients render the result.
 *
 * For each envelope (credit-card payment ones left out, as the widget does):
 *
 *   projected = available now
 *             − recurring expenses and subscription charges still due this month
 *             − usual daily spend × days left
 *
 * Usual daily spend is the category's spend over the last three months
 * divided by the days in them, on the same basis as `notifications/pace.ts`:
 * the same three prior months, positive amounts only, sentinels out, and only
 * months the account actually has. Entries the recurring and subscription
 * crons logged are left out, since those are already counted as scheduled.
 *
 * Short history: a prior month counts once the account's first expense is in
 * its first week. With none, the forecast uses this month's own pace from day
 * 7 (pace.ts's MIN_DAY) and is hidden (`basis: null`) before that.
 *
 * Dates are 'YYYY-MM-DD' strings compared at UTC midnight, like
 * `recurringExpense.ts`. Days left counts the days after today, like
 * `daysLeft` in `ai/expenseContext.ts`.
 */
import { occurrencesDue, type RecurringExpenseSchedule } from '@/lib/recurringExpense'
import { getEffectiveDueDate, rollForward, INACTIVE_STATUSES } from '@/lib/subscriptions'

export interface ForecastEnvelopeIn {
  category: string
  available: number
  isCreditCardPayment: boolean
}

export interface ForecastExpense {
  date: string
  amount_inr: number
  category: string
  notes?: string
  /** `sub:<service>:<date>` on a row the subscription cron wrote. */
  client_id?: string
  /** 'recurring' | 'subscription' for rows the crons wrote. */
  source?: string
}

export interface ForecastRecurringExpense extends RecurringExpenseSchedule {
  category: string
  amount_inr: number
}

export interface ForecastSubscription {
  service: string
  category?: string
  amount_inr: number
  billing_cycle?: string
  next_due_date?: string
  renewal_or_end_month?: string
  timestamp?: string
  status?: string
}

export interface ForecastRecurringIncome extends RecurringExpenseSchedule {
  amount: number
}

export interface ForecastInput {
  today: string
  envelopes: ForecastEnvelopeIn[]
  /** At least the three months before this one, plus this month so far. */
  expenses: ForecastExpense[]
  recurringExpenses: ForecastRecurringExpense[]
  subscriptions: ForecastSubscription[]
  recurringIncomes: ForecastRecurringIncome[]
  /** The account's first expense ever. Defaults to the earliest in `expenses`. */
  firstExpenseDate?: string
}

export interface ForecastEnvelope {
  category: string
  available: number
  /** Recurring expenses and subscriptions still due this month. */
  scheduled: number
  usualDaily: number
  /** Left at month end. Negative means over. */
  projected: number
  /** First day the envelope goes below zero, if it does before month end. */
  runsOutOn: string | null
  /** Already below zero today. */
  overspent: boolean
}

export interface NextMonth {
  month: string
  /** Recurring income due next month. */
  income: number
  /** Recurring expenses and subscriptions due next month. */
  spokenFor: number
  free: number
}

export interface Forecast {
  /** Where usual spend came from, or null when there's too little to say. */
  basis: 'history' | 'thisMonth' | null
  daysLeft: number
  totalLeft: number | null
  envelopes: ForecastEnvelope[]
  nextMonth: NextMonth
}

const HISTORY_MONTHS = 3
const MIN_DAY = 7
const SENTINELS = new Set(['__income__', '__credit_card__'])
const AUTO_NOTE = /^Auto-added from (recurring expense|subscription)/

const round2 = (n: number) => Math.round(n * 100) / 100 || 0

function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function daysIn(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

const monthEnd = (month: string) => `${month}-${String(daysIn(month)).padStart(2, '0')}`

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const isAuto = (e: ForecastExpense) => e.source === 'recurring' || e.source === 'subscription' || AUTO_NOTE.test(e.notes ?? '')

/** Each scheduled charge from today through `until`, as [date, category, amount]. Overdue recurrences land on today. */
function charges(input: ForecastInput, until: string, { requireCategory }: { requireCategory: boolean }): [string, string, number][] {
  const { today } = input
  const out: [string, string, number][] = []

  for (const r of input.recurringExpenses) {
    if (requireCategory && !r.category) continue
    for (const d of occurrencesDue(r, until)) out.push([d < today ? today : d, r.category, Number(r.amount_inr) || 0])
  }

  // The subscription cron logs on the due date itself, keyed `sub:<service>:<date>`; one already logged today isn't still due.
  const logged = new Set(input.expenses.map((e) => e.client_id))
  for (const s of input.subscriptions) {
    if (requireCategory && !s.category) continue
    if (s.status && INACTIVE_STATUSES.has(s.status.toLowerCase())) continue
    const cycle = s.billing_cycle ?? ''
    if (/one-time/i.test(cycle)) continue
    let d = getEffectiveDueDate(
      { nextDueDate: s.next_due_date ?? '', billingCycle: cycle, renewalOrEndMonth: s.renewal_or_end_month, timestamp: s.timestamp ?? '' },
      today,
    )
    for (let i = 0; d && d <= until && i < 400; i++) {
      if (!logged.has(`sub:${s.service}:${d}`)) out.push([d, s.category ?? '', Number(s.amount_inr) || 0])
      const next = rollForward(d, cycle)
      if (!next || next <= d) break
      d = next
    }
  }
  return out
}

function nextMonthLine(input: ForecastInput): NextMonth {
  const month = addMonths(input.today.slice(0, 7), 1)
  const end = monthEnd(month)
  const inMonth = (d: string) => d.startsWith(month)
  const income = input.recurringIncomes.reduce(
    (sum, r) => sum + occurrencesDue(r, end).filter(inMonth).length * (Number(r.amount) || 0),
    0,
  )
  // Every scheduled charge is money spoken for, filed under a category or not.
  const spokenFor = charges(input, end, { requireCategory: false })
    .filter(([d]) => inMonth(d))
    .reduce((sum, [, , amount]) => sum + amount, 0)
  return { month, income: round2(income), spokenFor: round2(spokenFor), free: round2(income - spokenFor) }
}

/** Per-category usual daily spend, and which basis it came from. */
function usualDaily(input: ForecastInput): { basis: Forecast['basis']; perDay: Map<string, number> } {
  const { today } = input
  const month = today.slice(0, 7)
  const day = Number(today.slice(8, 10))
  const spend = input.expenses.filter((e) => (Number(e.amount_inr) || 0) > 0 && !SENTINELS.has(e.category) && !isAuto(e))

  const first = input.firstExpenseDate || input.expenses.reduce((min, e) => (!min || e.date < min ? e.date : min), '')
  // A month counts once history covers it; a first month counts if it starts in its first week.
  const counted = Array.from({ length: HISTORY_MONTHS }, (_, i) => addMonths(month, -1 - i)).filter(
    (m) => first && (first.slice(0, 7) < m || (first.slice(0, 7) === m && Number(first.slice(8, 10)) <= MIN_DAY)),
  )

  const totals = new Map<string, number>()
  const add = (e: ForecastExpense) => totals.set(e.category, (totals.get(e.category) ?? 0) + Number(e.amount_inr))

  let days: number
  let basis: Forecast['basis']
  if (counted.length > 0) {
    const months = new Set(counted)
    spend.filter((e) => months.has(e.date.slice(0, 7))).forEach(add)
    days = counted.reduce((n, m) => n + daysIn(m), 0)
    basis = 'history'
  } else {
    const soFar = spend.filter((e) => e.date.startsWith(month) && e.date <= today)
    if (day < MIN_DAY || soFar.length === 0) return { basis: null, perDay: totals }
    soFar.forEach(add)
    days = day
    basis = 'thisMonth'
  }
  return { basis, perDay: new Map([...totals].map(([c, t]) => [c, t / days])) }
}

export function forecast(input: ForecastInput): Forecast {
  const { today } = input
  const month = today.slice(0, 7)
  const end = monthEnd(month)
  const daysLeft = Math.max(0, daysIn(month) - Number(today.slice(8, 10)))
  const nextMonth = nextMonthLine(input)

  const { basis, perDay } = usualDaily(input)
  if (!basis) return { basis, daysLeft, totalLeft: null, envelopes: [], nextMonth }

  const due = charges(input, end, { requireCategory: true })

  const envelopes = input.envelopes
    .filter((e) => !e.isCreditCardPayment)
    .map((e): ForecastEnvelope => {
      const daily = perDay.get(e.category) ?? 0
      const mine = due.filter(([, c]) => c === e.category)
      const scheduled = mine.reduce((sum, [, , amount]) => sum + amount, 0)
      const overspent = e.available < 0

      // Walk the days left to find the first one below zero. Today carries only what's still due today.
      let runsOutOn: string | null = null
      if (!overspent) {
        let balance = e.available
        for (let d = today; d <= end && !runsOutOn; d = nextDay(d)) {
          balance -= mine.filter(([on]) => on === d).reduce((sum, [, , amount]) => sum + amount, 0)
          if (d > today) balance -= daily
          if (balance < -0.005) runsOutOn = d
        }
      }

      return {
        category: e.category,
        available: round2(e.available),
        scheduled: round2(scheduled),
        usualDaily: round2(daily),
        projected: round2(e.available - scheduled - daily * daysLeft),
        runsOutOn,
        overspent,
      }
    })

  const totalLeft = round2(envelopes.reduce((sum, e) => sum + e.projected, 0))
  return { basis, daysLeft, totalLeft, envelopes, nextMonth }
}
