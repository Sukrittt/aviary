import { describe, it, expect } from 'vitest'
import type { StoredRow } from './normalize'
import { budgetStep, detectSalary, guessAccountType, incomeCounted, proposeAccounts, proposeBudgets, proposeCategories } from './propose'

const TODAY = '2026-10-17'

function row(over: Partial<StoredRow>): StoredRow {
  return { kind: 'expense', date: '2026-09-01', amount: 10, item: 'x', category: '', subcategory: '', account: '', notes: '', currency: '', ...over }
}

describe('proposeCategories', () => {
  it('joins subcategories with a dot, names empty ones, ranks by spend', () => {
    const plan = proposeCategories([
      row({ category: 'Food', subcategory: 'Groceries', amount: 50 }),
      row({ category: 'Rent', amount: 900 }),
      row({ category: '', amount: 5 }),
      row({ kind: 'income', category: 'Salary', amount: 5000 }),
    ])
    expect(plan.list).toEqual([
      { source: 'Rent', spent: 900 },
      { source: 'Food · Groceries', spent: 50 },
      { source: 'Uncategorised', spent: 5 },
    ])
    expect(plan.sourceOf(row({ category: 'Food', subcategory: 'Groceries' }))).toBe('Food · Groceries')
  })

  it('merges names that differ only in case or spacing', () => {
    const plan = proposeCategories([row({ category: 'Eating Out', amount: 10 }), row({ category: ' eating  out ', amount: 5 })])
    expect(plan.list).toEqual([{ source: 'Eating Out', spent: 15 }])
    expect(plan.sourceOf(row({ category: 'EATING OUT' }))).toBe('Eating Out')
  })

  it('names a merged category by its best-looking spelling, not the first one seen', () => {
    const plan = proposeCategories([row({ category: 'food', amount: 10 }), row({ category: 'FOOD', amount: 5 }), row({ category: 'Food', amount: 5 })])
    expect(plan.list).toEqual([{ source: 'Food', spent: 20 }])
  })

  it('clips a long category name without leaving a trailing space', () => {
    const plan = proposeCategories([row({ category: `${'a'.repeat(59)} tail`, amount: 1 })])
    expect(plan.list[0].source).toBe('a'.repeat(59))
  })

  it('drops the subcategory level above 40 categories', () => {
    const rows = Array.from({ length: 41 }, (_, i) => row({ category: `Group ${i % 5}`, subcategory: `Sub ${i}` }))
    const plan = proposeCategories(rows)
    expect(plan.joinSub).toBe(false)
    expect(plan.list).toHaveLength(5)
  })

  it('keeps the top 40 by spend and folds the rest into Uncategorised', () => {
    const rows = [
      ...Array.from({ length: 250 }, (_, i) => row({ category: `Free text ${i}`, amount: 1000 - i })),
      row({ category: '', amount: 1 }),
    ]
    const plan = proposeCategories(rows)
    expect(plan.list).toHaveLength(40)
    expect(plan.list).toContainEqual({ source: 'Free text 0', spent: 1000 })
    const other = plan.list.find((c) => c.source === 'Uncategorised')
    expect(other?.spent).toBe(rows.slice(39).reduce((s, r) => s + r.amount, 0))
    expect(plan.sourceOf(row({ category: 'Free text 38' }))).toBe('Free text 38')
    expect(plan.sourceOf(row({ category: 'Free text 39' }))).toBe('Uncategorised')
  })

  it('clips long names to 60 characters', () => {
    expect(proposeCategories([row({ category: 'c'.repeat(80) })]).list[0].source).toHaveLength(60)
  })
})

describe('guessAccountType', () => {
  it.each([
    ['Visa', 'credit_card'],
    ['Chase Sapphire Mastercard', 'credit_card'],
    ['Amex', 'credit_card'],
    ['HDFC Debit Card', 'bank'],
    ['Visa Debit', 'bank'],
    ['Cash', 'cash'],
    ['Checking', 'bank'],
  ])('%s is %s', (name, type) => {
    expect(guessAccountType(name)).toBe(type)
  })
})

describe('proposeAccounts', () => {
  it('guesses types from names and ranks by how often each appears', () => {
    const rows = [row({ account: 'HDFC Bank' }), row({ account: 'HDFC Bank' }), row({ account: 'Cash' }), row({ account: 'hdfc bank' }), row({ account: 'Amex Card' }), row({ account: 'Wallet' })]
    expect(proposeAccounts(rows)).toEqual({
      accounts: [
        { source: 'HDFC Bank', name: 'HDFC Bank', type: 'bank' },
        { source: 'Cash', name: 'Cash', type: 'cash' },
        { source: 'Amex Card', name: 'Amex Card', type: 'credit_card' },
        { source: 'Wallet', name: 'Wallet', type: 'cash' },
      ],
      dropped: [],
    })
  })

  it('keeps at most 5 bank accounts and 10 overall, and names the rest', () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => row({ account: `Bank ${i}` })),
      ...Array.from({ length: 7 }, (_, i) => row({ account: `Cash ${i}` })),
    ]
    const { accounts, dropped } = proposeAccounts(rows)
    expect(accounts.filter((a) => a.type === 'bank')).toHaveLength(5)
    expect(accounts).toHaveLength(10)
    expect(dropped).toEqual(['Bank 5', 'Bank 6', 'Cash 5', 'Cash 6'])
  })

  it('clips names to 30 characters', () => {
    expect(proposeAccounts([row({ account: 'a'.repeat(40) })]).accounts[0].name).toHaveLength(30)
  })

  it('keeps accounts apart when clipping would give them the same name', () => {
    const names = proposeAccounts([row({ account: 'HDFC Bank Savings Account no. 1234' }), row({ account: 'HDFC Bank Savings Account no. 5678' })]).accounts.map((a) => a.name)
    expect(names).toEqual(['HDFC Bank Savings Account no.', 'HDFC Bank Savings Account no 2'])
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(2)
  })
})

describe('detectSalary', () => {
  const pay = (date: string, amount: number, item = 'Acme payroll') => row({ kind: 'income', date, amount, item })

  it('finds the monthly payday with the largest amount, taking the most recent amount and its day', () => {
    expect(detectSalary([
      pay('2026-08-01', 80000), pay('2026-09-01', 85000), pay('2026-10-01', 85500),
      pay('2026-08-15', 2000, 'Rent from flatmate'), pay('2026-09-15', 2000, 'Rent from flatmate'), pay('2026-10-15', 2000, 'Rent from flatmate'),
      row({ date: '2026-10-02', amount: 99999 }),
    ], TODAY)).toEqual({ key: 'acme payroll', label: 'Acme payroll', amount: 85500, day: 1 })
  })

  it('groups by label, ignoring case and punctuation', () => {
    expect(detectSalary([pay('2026-09-03', 100, 'ACME, payroll'), pay('2026-10-03', 100, 'acme payroll')], TODAY)?.day).toBe(3)
  })

  it('falls back to the category when the label is empty', () => {
    expect(detectSalary([row({ kind: 'income', date: '2026-09-01', item: '', category: 'Salary' }), row({ kind: 'income', date: '2026-10-01', item: '', category: 'Salary' })], TODAY)?.label).toBe('Salary')
  })

  it('proposes nothing without a monthly pattern', () => {
    expect(detectSalary([pay('2026-06-01', 5), pay('2026-10-01', 5)], TODAY)).toBeNull()
  })

  it('proposes nothing when the last payday was more than 62 days ago', () => {
    expect(detectSalary([pay('2023-01-01', 5000), pay('2023-02-01', 5000), pay('2023-03-01', 5000)], TODAY)).toBeNull()
  })
})

describe('budgetStep', () => {
  it('rounds to 10 where everyday amounts are small, 100 elsewhere', () => {
    expect(budgetStep('USD')).toBe(10)
    expect(budgetStep('EUR')).toBe(10)
    expect(budgetStep('INR')).toBe(100)
    expect(budgetStep('JPY')).toBe(100)
  })
})

describe('proposeBudgets', () => {
  const byCategory = (r: StoredRow) => r.category

  it('averages the last three complete months and rounds up to the step', () => {
    const rows = [
      row({ date: '2026-06-10', category: 'Food', amount: 9999 }),
      row({ date: '2026-07-10', category: 'Food', amount: 1000 }),
      row({ date: '2026-08-10', category: 'Food', amount: 1200 }),
      row({ date: '2026-09-10', category: 'Food', amount: 1301 }),
      row({ date: '2026-10-10', category: 'Food', amount: 9999 }),
      row({ date: '2026-09-10', category: 'Rent', amount: 25000 }),
      row({ date: '2026-09-10', kind: 'income', category: 'Food', amount: 50000 }),
      row({ date: '2026-03-10', category: 'Old', amount: 500 }),
    ]
    expect(proposeBudgets(rows, byCategory, TODAY, 'INR', {})).toEqual({ Food: 1200, Rent: 8400 })
  })

  it('rounds a small envelope to its own size, not the currency step', () => {
    const rows = ['07', '08', '09'].flatMap((m) => [
      row({ date: `2026-${m}-05`, category: 'Gym', amount: 40 }),
      row({ date: `2026-${m}-12`, category: 'Streaming', amount: 15.49 }),
      row({ date: `2026-${m}-20`, category: 'Snacks', amount: 0.5 }),
    ])
    expect(proposeBudgets(rows, byCategory, TODAY, 'INR', {})).toEqual({ Gym: 40, Streaming: 20, Snacks: 1 })
  })

  it('nets refunds out of the average, and never proposes less than nothing', () => {
    const rows = [
      row({ date: '2026-07-10', category: 'Shopping', amount: 3000 }),
      row({ date: '2026-08-10', category: 'Shopping', amount: 3000 }),
      row({ date: '2026-09-10', category: 'Shopping', amount: 3000 }),
      row({ date: '2026-09-15', category: 'Shopping', amount: -1200 }),
      row({ date: '2026-09-10', category: 'Travel', amount: 900 }),
      row({ date: '2026-09-12', category: 'Travel', amount: -1800 }),
    ]
    expect(proposeBudgets(rows, byCategory, TODAY, 'INR', {})).toEqual({ Shopping: 2600, Travel: 0 })
  })

  it('divides by the months the file covers when it is shorter than three', () => {
    const rows = [row({ date: '2026-09-02', category: 'Food', amount: 455 }), row({ date: '2026-10-02', category: 'Food', amount: 10 })]
    expect(proposeBudgets(rows, byCategory, TODAY, 'USD', {})).toEqual({ Food: 460 })
  })

  it('a YNAB plan for this month wins over the average', () => {
    const rows = [row({ date: '2026-09-02', category: 'Rent', amount: 1490 })]
    expect(proposeBudgets(rows, byCategory, TODAY, 'USD', { Rent: 1500, Coffee: 35.5 })).toEqual({ Rent: 1500, Coffee: 35.5 })
  })

  it('a file that stopped a while ago averages its own last three complete months, not empty ones', () => {
    const rows = [
      row({ date: '2025-06-10', category: 'Food', amount: 9999 }),
      row({ date: '2025-07-10', category: 'Food', amount: 300 }),
      row({ date: '2025-08-10', category: 'Food', amount: 300 }),
      row({ date: '2025-09-10', category: 'Food', amount: 300 }),
      row({ date: '2025-09-26', category: 'Fun', amount: 90 }),
      // The file's last month is as partial as this one would be.
      row({ date: '2025-10-05', category: 'Food', amount: 9999 }),
    ]
    expect(proposeBudgets(rows, byCategory, TODAY, 'INR', {})).toEqual({ Food: 300, Fun: 30 })
  })

  it('a file entirely inside this month proposes nothing', () => {
    expect(proposeBudgets([row({ date: '2026-10-02', category: 'Food', amount: 5 })], byCategory, TODAY, 'INR', {})).toEqual({})
  })
})

describe('proposeBudgets, across a new year', () => {
  it('averages October to December in January', () => {
    const rows = [
      row({ date: '2026-09-30', category: 'Food', amount: 9000 }),
      row({ date: '2026-10-10', category: 'Food', amount: 300 }),
      row({ date: '2026-11-10', category: 'Food', amount: 300 }),
      row({ date: '2026-12-31', category: 'Food', amount: 300 }),
      row({ date: '2027-01-01', category: 'Food', amount: 9000 }),
    ]
    expect(proposeBudgets(rows, (r) => r.category, '2027-01-15', 'INR', {})).toEqual({ Food: 300 })
  })

  it('rounds an amount sitting exactly on a power of ten to itself', () => {
    const rows = [row({ date: '2026-09-10', category: 'Rent', amount: 1000 })]
    expect(proposeBudgets(rows, (r) => r.category, TODAY, 'INR', {})).toEqual({ Rent: 1000 })
  })
})

describe('detectSalary, dates', () => {
  const pay = (date: string, amount = 5) => row({ kind: 'income', date, amount, item: 'Pay' })

  it('sees a last-of-the-month payday as monthly, whatever the month’s length', () => {
    expect(detectSalary([pay('2026-07-31'), pay('2026-08-31'), pay('2026-09-30')], TODAY)).toMatchObject({ day: 30 })
  })

  it('still counts a payday exactly 62 days ago, but not 63', () => {
    expect(detectSalary([pay('2026-07-16'), pay('2026-08-16')], TODAY)).not.toBeNull()
    expect(detectSalary([pay('2026-07-15'), pay('2026-08-15')], TODAY)).toBeNull()
  })

  it('isn’t fooled by two rows on one day', () => {
    expect(detectSalary([pay('2026-10-01'), pay('2026-10-01')], TODAY)).toBeNull()
  })

  it('ignores refunds booked as spends', () => {
    expect(detectSalary([row({ date: '2026-09-01', amount: -5, item: 'Pay' }), row({ date: '2026-10-01', amount: -5, item: 'Pay' })], TODAY)).toBeNull()
  })
})

describe('proposeCategories, refunds', () => {
  it('nets a refund out of its category’s spend, even past zero', () => {
    const plan = proposeCategories([
      row({ category: 'Food', amount: 100 }),
      row({ category: 'food', amount: -30 }),
      row({ category: 'Travel', amount: -40 }),
    ])
    expect(plan.list).toEqual([{ source: 'Food', spent: 70 }, { source: 'Travel', spent: -40 }])
  })
})

describe('incomeCounted', () => {
  const salaryRow = (date: string) => row({ kind: 'income', date, item: 'Acme Payroll' })

  it('counts this month’s salary as monthly, since assigned already holds it', () => {
    expect(incomeCounted(salaryRow('2026-10-01'), 'acme payroll', '2026-10')).toBe('monthly')
  })

  it('counts past months’ salary as extra so each month shows its real income', () => {
    expect(incomeCounted(salaryRow('2026-09-01'), 'acme payroll', '2026-10')).toBe('extra')
  })

  it('counts every other income as extra, and everything when no salary was confirmed', () => {
    expect(incomeCounted(row({ kind: 'income', date: '2026-10-05', item: 'Gift' }), 'acme payroll', '2026-10')).toBe('extra')
    expect(incomeCounted(salaryRow('2026-10-01'), null, '2026-10')).toBe('extra')
  })
})
