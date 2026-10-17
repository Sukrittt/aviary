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
    expect(counts(rows)).toEqual({ expense: 6, income: 3 })
    expect(rows.filter((r) => r.kind === 'income').map((r) => r.item)).toEqual(['Paycheck', 'Return', 'Paycheck'])
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
  it('reads debit and credit columns as direction', () => {
    const out = normalize(inspect(csv(['Txn Date,Narration,Debit,Credit', '01/09/2026,SALARY,,85000', '02/09/2026,RENT,25000,'])), TODAY)
    expect(out.directionSource).toBe('column')
    expect(out.rows.map((r) => [r.kind, r.amount])).toEqual([['income', 85000], ['expense', 25000]])
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

  it('keeps the newest 20,000 rows and says how many it dropped', () => {
    const lines = ['Date,Item,Amount']
    for (let i = 0; i < 20_001; i++) lines.push(`${i === 0 ? '2020-01-01' : '2026-01-01'},Row ${i},-1`)
    const out = normalize(inspect(csv(lines)), TODAY)
    expect(out.rows).toHaveLength(20_000)
    expect(out.droppedOverCap).toBe(1)
    expect(out.rows.some((r) => r.date === '2020-01-01')).toBe(false)
  })

  it('clips item text to 200 and notes to 300', () => {
    const out = normalize(inspect(csv(['Date,Description,Amount,Notes', `2026-09-01,${'a'.repeat(250)},-1,${'b'.repeat(350)}`])), TODAY)
    expect(out.rows[0].item).toHaveLength(200)
    expect(out.rows[0].notes).toHaveLength(300)
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
})

describe('resolveRows', () => {
  const rows: StoredRow[] = [
    { kind: 'expense', date: '2026-09-01', amount: 5, item: 'a', category: '', subcategory: '', account: '', notes: '', currency: 'INR', bySign: true },
    { kind: 'income', date: '2026-09-02', amount: 9, item: 'b', category: '', subcategory: '', account: '', notes: '', currency: 'USD' },
  ]

  it('flips only rows whose direction came from the sign', () => {
    expect(resolveRows(rows, { direction: 'positive_spend', currency: 'INR', hasCurrency: false }).map((r) => r.kind)).toEqual(['income', 'income'])
  })

  it('skips rows in another currency when the file has a currency column', () => {
    expect(resolveRows(rows, { direction: 'negative_spend', currency: 'INR', hasCurrency: true }).map((r) => r.kind)).toEqual(['expense', 'skipped'])
  })
})
