import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { readTable, type Table } from './read'
import { inspect, needsColumnHelp, normalize, resolveRows, unresolvedColumns, ImportError, type StoredRow } from './normalize'

const TODAY = '2026-10-17'

async function load(...names: string[]): Promise<Table[]> {
  const tables: Table[] = []
  for (const name of names) tables.push(...(await readTable(readFileSync(path.join(import.meta.dirname, 'fixtures', name)), name)))
  return tables
}

function counts(rows: StoredRow[]) {
  return { expense: rows.filter((r) => r.kind === 'expense').length, income: rows.filter((r) => r.kind === 'income').length }
}

function csv(lines: string[]): Table[] {
  return [{ name: 'x.csv', rows: lines.map((l) => l.split(',')) }]
}

describe('presets', () => {
  it('Money Manager: unsigned amounts, Income/Expense column, transfers and modified balances left out', async () => {
    const out = normalize(inspect(await load('money-manager.csv')), TODAY)
    expect(out.app).toBe('moneymanager')
    expect(counts(out.rows)).toEqual({ expense: 7, income: 2 })
    expect(out.skipped).toEqual({ transfer: 2, opening_balance: 1, zero: 1, future: 1 })
    expect(out.directionSource).toBe('column')
    expect(out.hasCurrency).toBe(true)
    expect(out.rows[0]).toMatchObject({ kind: 'income', date: '2026-09-01', amount: 85000, item: 'Acme payroll', category: 'Salary' })
    expect(out.rows.find((r) => r.item === 'Big Bazaar, weekly')).toEqual({
      kind: 'expense', date: '2026-09-02', amount: 1250.5, item: 'Big Bazaar, weekly', category: 'Food', subcategory: 'Groceries',
      account: 'Cash', notes: '', currency: 'INR',
    })
    expect(out.rows.find((r) => r.item === 'Dinner')?.notes).toBe('with friends')
  })

  it('Monefy: signed amounts, the first of two currency columns, To/From/Initial balance categories', async () => {
    const out = normalize(inspect(await load('monefy.csv')), TODAY)
    expect(out.app).toBe('monefy')
    expect(counts(out.rows)).toEqual({ expense: 7, income: 2 })
    expect(out.skipped).toEqual({ transfer: 2, opening_balance: 1, zero: 1 })
    expect(out.directionSource).toBe('sign')
    expect(out.defaultDirection).toBe('negative_spend')
    expect(out.rows.find((r) => r.item === 'Airport')).toMatchObject({ kind: 'expense', amount: 23.4, currency: 'USD', account: 'Card' })
    expect(out.rows.find((r) => r.category === 'Taxi')?.item).toBe('Taxi')
  })

  it('Wallet: type column, transfer flag, payee as the item and the note kept', async () => {
    const out = normalize(inspect(await load('wallet.csv')), TODAY)
    expect(out.app).toBe('wallet')
    expect(counts(out.rows)).toEqual({ expense: 7, income: 2 })
    expect(out.skipped).toEqual({ transfer: 2, opening_balance: 1 })
    expect(out.rows.find((r) => r.notes === 'Weekly shop')).toMatchObject({ item: 'Tesco', amount: 45.2, category: 'Groceries', currency: 'GBP' })
    expect(out.rows.find((r) => r.item === 'Fnac')).toMatchObject({ amount: 25, currency: 'EUR', account: 'Credit card' })
  })

  it('Spendee: Income/Expense/Transfer type, ISO dates with an offset', async () => {
    const out = normalize(inspect(await load('spendee.csv')), TODAY)
    expect(out.app).toBe('spendee')
    expect(counts(out.rows)).toEqual({ expense: 6, income: 2 })
    expect(out.skipped).toEqual({ transfer: 2, opening_balance: 1, zero: 1 })
    expect(out.rows.find((r) => r.item === 'Lunch')).toMatchObject({ date: '2026-09-02', amount: 350, category: 'Food & Drink', account: 'Main' })
  })

  it('YNAB: outflow/inflow, transfer payees, starting balance, the Plan for this month', async () => {
    const out = normalize(inspect(await load('ynab-register.csv', 'ynab-plan.csv')), TODAY)
    expect(out.app).toBe('ynab')
    expect(counts(out.rows)).toEqual({ expense: 4, income: 3 })
    expect(out.skipped).toEqual({ transfer: 2, opening_balance: 1, zero: 1, future: 1 })
    expect(out.hasCurrency).toBe(false)
    expect(out.fileCurrency).toBe('USD')
    expect(out.rows.find((r) => r.notes === 'Split (1/2) food')).toMatchObject({
      kind: 'expense', date: '2026-09-14', amount: 80, item: 'Whole Foods', category: 'Groceries', subcategory: '', account: 'Visa', currency: '',
    })
    expect(out.plan).toEqual({ Rent: 1500, Groceries: 400, Coffee: 35.5 })
  })

  it('Goodbudget: [Unallocated] is income, fills and transfers left out, sign read from the data', async () => {
    const out = normalize(inspect(await load('goodbudget.csv')), TODAY)
    expect(out.app).toBe('goodbudget')
    expect(out.skipped).toEqual({ fill: 1, transfer: 1, zero: 1 })
    expect(out.directionSource).toBe('sign')
    expect(out.defaultDirection).toBe('positive_spend')
    const rows = resolveRows(out.rows, { direction: out.defaultDirection, currency: 'USD', hasCurrency: false })
    expect(counts(rows)).toEqual({ expense: 7, income: 2 })
    expect(rows.filter((r) => r.kind === 'income').map((r) => r.item)).toEqual(['Paycheck', 'Paycheck'])
    expect(rows.find((r) => r.item === 'Return')).toMatchObject({ kind: 'expense', amount: -10, category: 'Groceries' })
    expect(rows.find((r) => r.item === 'Landlord')).toMatchObject({ kind: 'expense', amount: 1200, category: 'Rent' })
  })

  it('a spreadsheet: header under a title line, generic aliases', async () => {
    const out = normalize(inspect(await load('generic.csv')), TODAY)
    expect(out.app).toBe('generic')
    expect(counts(out.rows)).toEqual({ expense: 5, income: 2 })
    expect(out.skipped).toEqual({ transfer: 1, unparseable: 1, zero: 1 })
    expect(out.rows.find((r) => r.item === 'Netflix')).toMatchObject({ kind: 'expense', amount: 15.49, category: 'Subscriptions', account: 'Credit Card' })
  })
})

describe('generic files', () => {
  it.each([
    [['€ 3,99', '€ 12,00'], 'EUR'],
    [['₹1,250', '-₹40'], 'INR'],
    [['Rs. 1,250', 'Rs 40'], 'INR'],
    [['12.50 GBP', '-3.00 GBP'], 'GBP'],
    [['10 DR', '5 CR'], ''],
    [['$5', '€5'], ''],
    [['5', '-7'], ''],
  ])('names the currency its amounts show: %j', (amounts, code) => {
    const out = normalize(inspect([{ name: 'x.csv', rows: [['Date', 'Item', 'Amount'], ...amounts.map((a, i) => [`2026-09-0${i + 1}`, 'Thing', a])] }]), TODAY)
    expect(out.hasCurrency).toBe(false)
    expect(out.fileCurrency).toBe(code)
  })

  it('reads debit and credit columns as direction', () => {
    const out = normalize(inspect(csv(['Txn Date,Narration,Debit,Credit', '01/09/2026,SALARY,,85000', '02/09/2026,RENT,25000,'])), TODAY)
    expect(out.directionSource).toBe('column')
    expect(out.rows.map((r) => [r.kind, r.amount])).toEqual([['income', 85000], ['expense', 25000]])
  })

  it('calls a file with a header and no rows empty, not unreadable', () => {
    expect(() => normalize(inspect(csv(['Date,Description,Amount'])), TODAY)).toThrow(new ImportError('empty_file'))
  })

  it('reads axio’s PLACE column as the item, not the category', () => {
    const out = normalize(inspect(csv(['DATE,TIME,PLACE,AMOUNT,DR/CR,ACCOUNT,CATEGORY,NOTE', '01-06-2026,19:55,Taco Spot,1124.00,DR,ICICI Card,Eating out,'])), TODAY)
    expect(out.rows[0]).toMatchObject({ kind: 'expense', item: 'Taco Spot', category: 'Eating out', amount: 1124 })
  })

  it('a file of nothing but paydays reads them as money in', () => {
    const out = normalize(inspect(csv(['Date,Item,Category,Amount', '2026-08-01,Payroll,Salary,2000', '2026-09-01,Payroll,Salary,2000'])), TODAY)
    expect(out.defaultDirection).toBe('negative_spend')
    expect(resolveRows(out.rows, { direction: out.defaultDirection, currency: 'INR', hasCurrency: false }).map((r) => r.kind)).toEqual(['income', 'income'])
  })

  it('reads a Dr/Cr type column', () => {
    const out = normalize(inspect(csv(['Date,Particulars,Amount,Dr/Cr', '01/09/2026,Pay,500,Cr', '02/09/2026,Shop,20,Dr'])), TODAY)
    expect(out.rows.map((r) => r.kind)).toEqual(['income', 'expense'])
  })

  it('a positive-only spend tracker defaults to positive is spend', () => {
    const out = normalize(inspect(csv(['Date,Item,Amount', '2026-09-01,Coffee,4', '2026-09-02,Lunch,12', '2026-09-03,Bus,2'])), TODAY)
    expect(out.defaultDirection).toBe('positive_spend')
    expect(resolveRows(out.rows, { direction: 'positive_spend', currency: 'INR', hasCurrency: false }).every((r) => r.kind === 'expense')).toBe(true)
  })

  it('reads comma decimals across the file', () => {
    const out = normalize(inspect([{ name: 'x.csv', rows: [['Date', 'Description', 'Amount'], ['01.09.2026', 'Miete', '-1.250,00'], ['02.09.2026', 'Brot', '-3,50']] }]), TODAY)
    expect(out.rows.map((r) => r.amount)).toEqual([1250, 3.5])
  })

  it('reads dot thousands without cents at full size', () => {
    const out = normalize(inspect([{ name: 'x.csv', rows: [['Date', 'Description', 'Amount'], ['01.09.2026', 'Kopi', '-50.000'], ['02.09.2026', 'Sewa', '-1.250.000'], ['03.09.2026', 'Makan', '-125.000']] }]), TODAY)
    expect(out.rows.map((r) => r.amount)).toEqual([50000, 1250000, 125000])
  })

  it('keeps every row of fifteen years of history, the oldest included', () => {
    const lines = ['Date,Description,Amount,Account,Category,Subcategory,Notes']
    for (let i = 0; i < 50_000; i++) {
      const date = new Date(Date.UTC(2011, 9, 1) + Math.floor(i / 9.2) * 86_400_000).toISOString().slice(0, 10)
      lines.push(`${date},Swiggy dinner ${i % 50},-1250.50,HDFC Credit Card,Food,Eating out,${i % 5 ? '' : 'with friends'}`)
    }
    const out = normalize(inspect(csv(lines)), TODAY)
    expect(out.rows).toHaveLength(50_000)
    expect(out.rows[0].date).toBe('2011-10-01')
  })

  it('clips item text to 200 and notes to 300', () => {
    const out = normalize(inspect(csv(['Date,Description,Amount,Notes', `2026-09-01,${'a'.repeat(250)},-1,${'b'.repeat(350)}`])), TODAY)
    expect(out.rows[0].item).toHaveLength(200)
    expect(out.rows[0].notes).toHaveLength(300)
  })

  it('clips account, category and subcategory to 100', () => {
    const long = 'c'.repeat(150)
    const out = normalize(inspect(csv(['Date,Item,Amount,Account,Category,Subcategory', `2026-09-01,Bread,-1,${long},${long},${long}`])), TODAY)
    expect([out.rows[0].account, out.rows[0].category, out.rows[0].subcategory].map((s) => s.length)).toEqual([100, 100, 100])
  })

  it('asks for help with columns it cannot place, and only those', () => {
    const layout = inspect(csv(['Fecha,Concepto,Importe', '01/09/2026,Pan,-2']))
    expect(needsColumnHelp(layout)).toBe(true)
    expect(unresolvedColumns(layout)).toEqual([
      { index: 0, name: 'Fecha', samples: ['01/09/2026'] },
      { index: 1, name: 'Concepto', samples: ['Pan'] },
      { index: 2, name: 'Importe', samples: ['-2'] },
    ])
    const out = normalize(layout, TODAY, { 0: 'date', 1: 'text', 2: 'amount' })
    expect(out.rows).toMatchObject([{ kind: 'expense', item: 'Pan', amount: 2 }])
  })

  it('refuses a file without a date or an amount', () => {
    expect(() => normalize(inspect(csv(['Name,Notes', 'a,b'])), TODAY)).toThrow(new ImportError('no_columns'))
  })

  it('refuses a file where nothing parses', () => {
    expect(() => normalize(inspect(csv(['Date,Item,Amount', 'soon,x,y'])), TODAY)).toThrow(new ImportError('unreadable'))
  })

  it.each([
    ['dated in the future', ['Date,Item,Amount', '2031-01-01,x,-4', '2031-02-01,y,-5']],
    ['zero', ['Date,Item,Amount', '2026-09-01,x,0', '2026-09-02,y,0.00']],
  ])('refuses a file whose every row is %s: nothing to bring in', (_, lines) => {
    expect(() => normalize(inspect(csv(lines)), TODAY)).toThrow(new ImportError('empty'))
  })
})

describe('refunds', () => {
  const resolved = (lines: string[]) => {
    const out = normalize(inspect(csv(lines)), TODAY)
    return resolveRows(out.rows, { direction: out.defaultDirection, currency: 'INR', hasCurrency: false })
  }

  it('books money back on a spending category as a refund, a negative spend there, not income', () => {
    const rows = resolved([
      'Date,Item,Category,Amount', '2026-09-01,Acme payroll,Salary,85000', '2026-09-02,Myntra,Shopping,-3000',
      '2026-09-05,Myntra return,Shopping,1200', '2026-09-08,IRCTC,Travel,-2400', '2026-09-09,IRCTC cancellation,Travel,1800',
    ])
    expect(rows.map((r) => [r.item, r.kind, r.amount])).toEqual([
      ['Acme payroll', 'income', 85000], ['Myntra', 'expense', 3000], ['Myntra return', 'expense', -1200],
      ['IRCTC', 'expense', 2400], ['IRCTC cancellation', 'expense', -1800],
    ])
  })

  it('keeps money in as income on an income category, one with no spends, or none at all', () => {
    const rows = resolved([
      'Date,Item,Category,Amount', '2026-09-01,Acme payroll,Salary,85000', '2026-09-02,Payroll tax fix,Salary,-200',
      '2026-09-03,Ready to Assign,Inflow: Ready to Assign,500', '2026-09-03,Oops,Inflow: Ready to Assign,-5',
      '2026-09-04,Gift from mum,Gifts,2000', '2026-09-05,Cash found,,100', '2026-09-06,Bread,Food,-40',
    ])
    expect(rows.filter((r) => r.kind === 'income').map((r) => r.item)).toEqual(['Acme payroll', 'Ready to Assign', 'Gift from mum', 'Cash found'])
  })

  it('reads a YNAB inflow on a spending category as a refund', async () => {
    const out = normalize(inspect(await load('ynab-register.csv')), TODAY)
    const rows = resolveRows(out.rows, { direction: out.defaultDirection, currency: 'USD', hasCurrency: false })
    expect(rows.find((r) => r.item === 'Store refund')).toMatchObject({ kind: 'expense', amount: -15, category: 'Groceries' })
    expect(rows.filter((r) => r.kind === 'income').map((r) => r.item)).toEqual(['Acme Corp', 'Acme Corp'])
  })

  it('trusts an app’s own type column over the category', () => {
    const rows = resolved(['Date,Item,Category,Amount,Type', '2026-09-01,Shop,Food,40,Expense', '2026-09-02,Cashback,Food,15,Income'])
    expect(rows.map((r) => r.kind)).toEqual(['expense', 'income'])
  })
})

describe('YNAB plan', () => {
  it('reads a comma-decimal plan the same way as its register', () => {
    const tables: Table[] = [
      { name: 'Register.csv', rows: [['Account', 'Date', 'Payee', 'Category', 'Memo', 'Outflow', 'Inflow'], ['Giro', '01.10.2026', 'Rewe', 'Groceries', '', '12,50 €', '0,00 €']] },
      { name: 'Plan.csv', rows: [['Month', 'Category', 'Assigned'], ['Oct 2026', 'Groceries', '1.250,00 €']] },
    ]
    expect(normalize(inspect(tables), TODAY).plan).toEqual({ Groceries: 1250 })
  })
})

describe('resolveRows', () => {
  const rows: StoredRow[] = [
    { kind: 'expense', date: '2026-09-01', amount: 5, item: 'a', category: '', subcategory: '', account: '', notes: '', currency: 'INR', bySign: true },
    { kind: 'income', date: '2026-09-02', amount: 9, item: 'b', category: '', subcategory: '', account: '', notes: '', currency: 'USD' },
  ]

  it('flips only rows whose direction came from the sign', () => {
    expect(resolveRows(rows, { direction: 'positive_spend', currency: 'INR', hasCurrency: false }).map((r) => r.kind)).toEqual(['income', 'income'])
  })

  it('turns a flipped row into a refund when it lands on a spending category', () => {
    // Read as positive-is-spend: the 15 is the spend, the 40 money back on the same category.
    const signed: StoredRow[] = [
      { ...rows[0], category: 'Food', amount: 40, byAmount: true },
      { ...rows[0], kind: 'income', category: 'Food', amount: 15, bySign: true, byAmount: true },
    ]
    expect(resolveRows(signed, { direction: 'positive_spend', currency: 'INR', hasCurrency: false }).map((r) => [r.kind, r.amount])).toEqual([['expense', -40], ['expense', 15]])
  })

  it('skips rows in another currency when the file has a currency column', () => {
    expect(resolveRows(rows, { direction: 'negative_spend', currency: 'INR', hasCurrency: true }).map((r) => r.kind)).toEqual(['expense', 'skipped'])
  })
})
