import { describe, it, expect } from 'vitest'
import { summarizeExpenses, factsFor, factsWindowStart, FACT_SECTIONS, type SummarizeExpensesInput } from './expenseContext'

const input: SummarizeExpensesInput = {
  expenses: [
    { date: '2026-09-04', item: 'Swiggy dinner', amount_inr: 640, category: 'Food' },
    { date: '2026-09-02', item: 'Metro card', amount_inr: 300, category: 'Travel' },
    { date: '2026-08-12', item: 'Swiggy lunch', amount_inr: 420, category: 'Food' },
    { date: '2026-09-01', item: 'Salary', amount_inr: 90000, category: '__income__' },
  ],
  budgets: [
    // Income lives in `budgets` under the sentinel category, not in `expenses`.
    { month: '2026-09', category: '__income__', assigned: 90000, rolled_over: 0 },
    { month: '2026-09', category: 'Food', assigned: 8000, rolled_over: 0 },
    { month: '2026-09', category: 'Travel', assigned: 2000, rolled_over: 0 },
  ],
  categories: [{ name: 'Food', group: 'Needs' }, { name: 'Travel', group: 'Needs' }],
  groups: [{ name: 'Needs' }],
  subscriptions: [{ service: 'Netflix', amount_inr: 649, billing_cycle: 'monthly' }],
  holdings: [{ name: 'Nifty Index Fund', type: 'Equity', value: 120000 }],
  currentMonth: '2026-09',
  today: '2026-09-23',
}

describe('summarizeExpenses sections', () => {
  // /security and the Ask Aviary page promise this. Change them together.
  it('keeps saved notes out of the FACTS text', () => {
    const { facts } = summarizeExpenses({ ...input, expenses: input.expenses.map((e) => ({ ...e, notes: 'PRIVATE-NOTE' })) })
    expect(facts).not.toContain('PRIVATE-NOTE')
  })

  it('returns one string per known section', () => {
    const { sections } = summarizeExpenses(input)
    expect(Object.keys(sections).sort()).toEqual([...FACT_SECTIONS].sort())
    expect(sections.header).toContain('MONTH: 2026-09')
    expect(sections.envelopes).toContain('Food|Needs|')
    expect(sections.transactions).toContain('Swiggy dinner')
    expect(sections.subscriptions).toContain('Netflix')
    expect(sections.investments).toContain('Nifty Index Fund')
  })

  it('keeps `facts` equal to every section joined in order', () => {
    const { facts, sections } = summarizeExpenses(input)
    expect(facts).toBe(FACT_SECTIONS.map((s) => sections[s]).join('\n\n'))
  })

  it('never leaks sentinel categories into the envelope list', () => {
    const { sections } = summarizeExpenses(input)
    expect(sections.envelopes).not.toContain('__income__')
    expect(sections.header).toContain('INCOME: 90000')
  })

  it('states the unassigned money, so the model can tell spare income from a real shortfall', () => {
    const { sections } = summarizeExpenses(input)
    // 90000 income, 8000 + 2000 assigned.
    expect(sections.header).toContain('ASSIGNED THIS MONTH: 10000')
    expect(sections.header).toContain('READY TO ASSIGN: 80000')
  })

  it('reports ready to assign as negative when more is assigned than earned', () => {
    const { sections } = summarizeExpenses({
      ...input,
      budgets: [...input.budgets.filter((b) => b.category !== 'Food'), { month: '2026-09', category: 'Food', assigned: 95000, rolled_over: 0 }],
    })
    expect(sections.header).toContain('READY TO ASSIGN: -7000')
  })
})

describe('summarizeExpenses precomputed totals', () => {
  // Flash-lite got long sums wrong (a merchant over 90 days, a month's total), so FACTS states them.
  it('totals the envelopes, splitting spare money from overspending', () => {
    const { sections } = summarizeExpenses(input)
    // Food 8000 - 640 = 7360, Travel 2000 - 300 = 1700.
    expect(sections.envelopes).toContain('TOTALS: assigned 10000, spent 940, available 9060 (unspent 9060, overspent 0)')
  })

  it('states money left this month and money free for a new cost', () => {
    // Food assigned 8000, 640 spent; Travel assigned 2000 but 2300 spent (300 over). Income 90000.
    const { sections } = summarizeExpenses({
      ...input,
      expenses: [...input.expenses, { date: '2026-09-05', item: 'Train', amount_inr: 2000, category: 'Travel' }],
    })
    // Ready to assign 80000. Left: available (7360 - 300) + 80000. Free: 80000 - 300.
    expect(sections.envelopes).toContain('LEFT THIS MONTH: 87060')
    expect(sections.envelopes).toContain('FREE FOR NEW COSTS: 79700')
  })

  it('adds a total row and an average of the full months to the trend', () => {
    const { sections } = summarizeExpenses(input)
    expect(sections.trend).toMatch(/category\|.*\|avg full months/)
    // Food: 420 in August, 640 so far in September. The current month is partial and
    // months before the first expense aren't history, so the average is August alone.
    expect(sections.trend).toContain('Food|0|0|0|0|420|640|420')
    expect(sections.trend).toContain('TOTAL|0|0|0|0|420|940|420')
  })

  it('reports what each month saved and the running total since', () => {
    const { sections } = summarizeExpenses({
      ...input,
      budgets: [...input.budgets, { month: '2026-08', category: '__income__', assigned: 80000, rolled_over: 0 }],
    })
    // August: 80000 - 420. September so far: 90000 - 940. Months before any income show '-'.
    expect(sections.trend).toContain('SAVED (income minus spending)|-|-|-|-|79580|89060|79580')
    expect(sections.trend).toContain('SAVED SINCE 2026-08: 79580')
  })

  it('totals repeat merchants over the transaction window', () => {
    const { sections } = summarizeExpenses({
      ...input,
      expenses: [
        ...input.expenses,
        { date: '2026-09-10', item: 'Swiggy dinner', amount_inr: 100, category: 'Food' },
      ],
    })
    // "Swiggy dinner" twice this month (640 + 100), "Swiggy lunch" once is not repeated.
    expect(sections.transactions).toContain('Swiggy dinner|740|740|2')
    expect(sections.transactions).not.toMatch(/Swiggy lunch\|\d+\|\d+\|\d+$/m)
  })
})

describe('summarizeExpenses projection facts', () => {
  // Ask Aviary counted an 18,000 "set aside" savings category and a stock buy as
  // basic monthly spending, and only spotted the one-offs in the top 10.
  const withSavings: SummarizeExpensesInput = {
    ...input,
    expenses: [
      ...input.expenses,
      { date: '2026-09-05', item: 'Kotak Stocks', amount_inr: 20000, category: 'Investments' },
      { date: '2026-09-05', item: 'Set aside for trip', amount_inr: 5000, category: 'Trip Fund' },
      { date: '2026-08-02', item: 'Metro card', amount_inr: 300, category: 'Travel' },
      { date: '2026-09-21', item: 'Football Boots', amount_inr: 5999, category: 'Shopping' },
    ],
    categories: [...input.categories, { name: 'Investments', group: 'Wealth' }, { name: 'Trip Fund', group: '🌱 Savings' }, { name: 'Shopping', group: 'Wants' }],
  }

  it('states spending without the money moved into savings and investment categories', () => {
    const { sections } = summarizeExpenses(withSavings)
    // Spent 640 + 300 + 5999 + 20000 + 5000 = 31939; 25000 of it went to savings.
    expect(sections.envelopes).toContain('SPENDING ONLY: 6939 (spent minus 25000 moved to savings and investment categories: Investments 20000, Trip Fund 5000)')
  })

  it('adds a spending-only row to the trend', () => {
    const { sections } = summarizeExpenses(withSavings)
    // August: 420 + 300. September: 6939.
    expect(sections.trend).toContain('TOTAL WITHOUT SAVINGS|0|0|0|0|720|6939|720')
  })

  it('leaves the spending-only lines out when nothing went to savings', () => {
    const { sections } = summarizeExpenses(input)
    expect(sections.envelopes).not.toContain('SPENDING ONLY')
    expect(sections.trend).not.toContain('TOTAL WITHOUT SAVINGS')
  })

  it('hands the projection its inputs: spending only, new items, and regulars not paid yet', () => {
    const { projection } = summarizeExpenses({
      ...withSavings,
      expenses: [
        ...withSavings.expenses,
        // Paid in both full months, not yet in September.
        { date: '2026-07-19', item: 'Electricity', amount_inr: 400, category: 'Bills' },
        { date: '2026-08-19', item: 'Electricity', amount_inr: 500, category: 'Bills' },
      ],
      categories: [...withSavings.categories, { name: 'Bills', group: 'Needs' }],
    })
    expect(projection.spendingOnly).toBe(6939)
    expect(projection.newItems.map((e) => e.item)).toEqual(['Football Boots', 'Swiggy dinner'])
    expect(projection.missingRegulars).toEqual([{ category: 'Bills', usual: 450 }])
  })

  it('lists this month\'s new items, biggest first, as one-off candidates', () => {
    const { sections } = summarizeExpenses(withSavings)
    const list = sections.transactions.split('NEW THIS MONTH')[1]
    expect(list).toBeDefined()
    // Metro card also ran in August, so it is not new; savings moves are not purchases.
    expect(list).toMatch(/2026-09-21\|Football Boots\|5999\|Shopping\n2026-09-04\|Swiggy dinner\|640\|Food/)
    expect(list).not.toContain('Metro card')
    expect(list).not.toContain('Kotak Stocks')
  })
})

describe('factsFor', () => {
  it('includes only the requested sections, in canonical order', () => {
    const { sections } = summarizeExpenses(input)
    const sliced = factsFor(sections, ['envelopes', 'header'])
    expect(sliced).toBe(`${sections.header}\n\n${sections.envelopes}`)
  })

  it('drops the transaction rows when they are not requested', () => {
    const { sections } = summarizeExpenses(input)
    const sliced = factsFor(sections, ['header', 'envelopes'])
    expect(sliced).not.toContain('Swiggy dinner')
    expect(sliced.length).toBeLessThan(factsFor(sections, [...FACT_SECTIONS]).length)
  })

  it('de-duplicates repeated sections', () => {
    const { sections } = summarizeExpenses(input)
    expect(factsFor(sections, ['header', 'header'])).toBe(sections.header)
  })
})

describe('factsWindowStart', () => {
  it('reaches back far enough to cover every section the facts report', () => {
    // Six trend months inclusive of the current one, so five whole months back.
    expect(factsWindowStart('2026-09-23')).toBe('2026-04-01')
  })

  it('crosses the year boundary', () => {
    expect(factsWindowStart('2026-02-14')).toBe('2025-09-01')
  })

  it('starts on or before the oldest date any section uses', () => {
    const today = '2026-09-23'
    const start = factsWindowStart(today)
    const ninetyDaysAgo = new Date(`${today}T00:00:00`)
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    expect(start <= ninetyDaysAgo.toISOString().slice(0, 10)).toBe(true)
  })
})
