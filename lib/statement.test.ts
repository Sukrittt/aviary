import { describe, it, expect, vi } from 'vitest'
import {
  normalizeStatement,
  payeeLabel,
  statementClientIds,
  markSuggestedSkips,
  rowsFromTable,
  isLockedPdf,
  MAX_STATEMENT_ROWS,
} from './statement'

const TODAY = '2026-10-19'

describe('normalizeStatement', () => {
  it('keeps debits, counts credits and never adds them', () => {
    const out = normalizeStatement({
      transactions: [
        { date: '2026-10-17', amount: 240, payee: 'Rapido', direction: 'debit' },
        { date: '2026-10-17', amount: 5000, payee: 'Rahul Sharma', direction: 'credit' },
        { date: '2026-10-18', amount: 150.456, payee: 'Chai Point', direction: 'debit' },
      ],
    }, TODAY)
    expect(out.rows).toEqual([
      { date: '2026-10-17', amount: 240, payee: 'Rapido' },
      { date: '2026-10-18', amount: 150.46, payee: 'Chai Point' },
    ])
    expect(out.credits).toBe(1)
  })

  it('reads a negative amount as money out whatever the label says', () => {
    const out = normalizeStatement({ transactions: [{ date: '2026-10-18', amount: -99, payee: 'Swiggy', direction: 'debit' }] }, TODAY)
    expect(out.rows).toEqual([{ date: '2026-10-18', amount: 99, payee: 'Swiggy' }])
  })

  it('drops rows with no amount, a bad or future date, or older than 31 days', () => {
    const out = normalizeStatement({
      transactions: [
        { date: '2026-10-18', amount: 0, payee: 'Zero', direction: 'debit' },
        { date: 'yesterday', amount: 50, payee: 'Bad date', direction: 'debit' },
        { date: '2026-10-25', amount: 50, payee: 'Future', direction: 'debit' },
        { date: '2026-09-17', amount: 50, payee: 'Too old', direction: 'debit' },
        { date: '2026-09-18', amount: 50, payee: 'Just in', direction: 'debit' },
        { date: '2026-10-18', amount: 'abc', payee: 'NaN', direction: 'debit' },
      ],
    }, TODAY)
    expect(out.rows.map((r) => r.payee)).toEqual(['Just in'])
    expect(out.dropped).toBe(5)
  })

  it('keeps the newest rows when there are too many, oldest first', () => {
    const transactions = Array.from({ length: MAX_STATEMENT_ROWS + 10 }, (_, i) => ({
      date: i < 10 ? '2026-09-20' : '2026-10-18', amount: i + 1, payee: `P${i}`, direction: 'debit',
    }))
    const out = normalizeStatement({ transactions }, TODAY)
    expect(out.rows).toHaveLength(MAX_STATEMENT_ROWS)
    expect(out.rows.every((r) => r.date === '2026-10-18')).toBe(true)
    expect(out.dropped).toBe(10)
  })

  it('names a row with no payee and survives a malformed reply', () => {
    expect(normalizeStatement({ transactions: [{ date: '2026-10-18', amount: 10, direction: 'debit' }] }, TODAY).rows[0].payee).toBe('Payment')
    expect(normalizeStatement(null, TODAY)).toEqual({ rows: [], credits: 0, dropped: 0 })
  })
})

describe('payeeLabel', () => {
  it('pulls the merchant out of UPI narrations', () => {
    expect(payeeLabel('UPI/DR/412345678901/SWIGGY/YESB/swiggy@ybl/Payment')).toBe('Swiggy')
    expect(payeeLabel('UPI-ZOMATO LTD-zomato@hdfcbank-HDFC0000001-412345678901-UPI')).toBe('Zomato Ltd')
    expect(payeeLabel('UPI/412345678901/Payment from Ph/rapido@axl/AXIS')).toBe('Rapido')
  })

  it('leaves plain names alone apart from tidying', () => {
    expect(payeeLabel('  Chai   Point ')).toBe('Chai Point')
    expect(payeeLabel('POS 4321 DMART ANDHERI')).toBe('Dmart Andheri')
  })

  it('caps the length', () => {
    expect(payeeLabel('A'.repeat(200)).length).toBeLessThanOrEqual(60)
  })
})

describe('statementClientIds', () => {
  it('is stable for the same date, amount and payee', () => {
    const a = statementClientIds([{ date: '2026-10-18', amount: 240, payee: 'Rapido' }])
    const b = statementClientIds([{ date: '2026-10-18', amount: 240.0, payee: '  rapido ' }])
    expect(a).toEqual(b)
    expect(a[0]).toMatch(/^statement:[0-9a-f]{20}$/)
  })

  it('differs when any of them changes', () => {
    const [base, date, amount, payee] = statementClientIds([
      { date: '2026-10-18', amount: 240, payee: 'Rapido' },
      { date: '2026-10-17', amount: 240, payee: 'Rapido' },
      { date: '2026-10-18', amount: 241, payee: 'Rapido' },
      { date: '2026-10-18', amount: 240, payee: 'Uber' },
    ])
    expect(new Set([base, date, amount, payee]).size).toBe(4)
  })

  it('tells two identical chais apart, the same way every upload', () => {
    const chai = { date: '2026-10-18', amount: 20, payee: 'Chai' }
    const first = statementClientIds([chai, chai])
    expect(first[0]).not.toBe(first[1])
    expect(statementClientIds([chai, chai])).toEqual(first)
  })
})

describe('markSuggestedSkips', () => {
  const rows = [
    { date: '2026-10-14', amount: 300, payee: 'Old' },
    { date: '2026-10-17', amount: 240, payee: 'Rapido' },
    { date: '2026-10-18', amount: 20, payee: 'Chai' },
    { date: '2026-10-18', amount: 20, payee: 'Chai' },
    { date: '2026-10-18', amount: 999, payee: 'New' },
  ]

  it('unchecks rows that look logged: same amount, within a day', () => {
    const skips = markSuggestedSkips(rows, [{ date: '2026-10-16', amount: 240 }, { date: '2026-10-18', amount: 20 }], null)
    expect(skips).toEqual([null, 'logged', 'logged', null, null])
  })

  it('matches each logged expense to one row only', () => {
    const skips = markSuggestedSkips(rows, [{ date: '2026-10-18', amount: 20 }], null)
    expect(skips.filter((s) => s === 'logged')).toHaveLength(1)
  })

  it('does not match two days apart or a different amount', () => {
    expect(markSuggestedSkips(rows, [{ date: '2026-10-15', amount: 240 }, { date: '2026-10-18', amount: 21 }], null)).toEqual([null, null, null, null, null])
  })

  it('unchecks rows dated before the last logged expense', () => {
    expect(markSuggestedSkips(rows, [], '2026-10-17')).toEqual(['before_last', null, null, null, null])
  })

  it('compares amounts to the paisa', () => {
    expect(markSuggestedSkips([{ date: '2026-10-18', amount: 0.3, payee: 'x' }], [{ date: '2026-10-18', amount: 0.1 + 0.2 }], null)).toEqual(['logged'])
  })
})

describe('rowsFromTable', () => {
  it('turns a bank statement with withdrawal and deposit columns into transactions', () => {
    const out = rowsFromTable([
      { kind: 'expense', date: '2026-10-17', amount: 240, item: 'UPI/DR/412345678901/RAPIDO/YESB/rapido@ybl/Payment', category: '', subcategory: '', account: '', notes: '', currency: '' },
      { kind: 'income', date: '2026-10-17', amount: 5000, item: 'NEFT salary', category: '', subcategory: '', account: '', notes: '', currency: '' },
    ])
    expect(out).toEqual({
      transactions: [
        { date: '2026-10-17', amount: 240, payee: 'Rapido', direction: 'debit' },
        { date: '2026-10-17', amount: 5000, payee: 'NEFT salary', direction: 'credit' },
      ],
    })
  })
})

describe('isLockedPdf', () => {
  it('spots an encrypted pdf by its trailer', () => {
    expect(isLockedPdf(Buffer.from('%PDF-1.7\n...trailer << /Root 1 0 R /Encrypt 5 0 R >>'))).toBe(true)
    expect(isLockedPdf(Buffer.from('%PDF-1.7\n...trailer << /Root 1 0 R >>'))).toBe(false)
  })
})

describe('a bank csv end to end', () => {
  it('reads an HDFC-style statement into debits, with credits counted', async () => {
    const { readTable } = await import('./import/read')
    const { inspect, normalize, resolveRows } = await import('./import/normalize')
    const csv = [
      'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
      '17/10/26,UPI-SWIGGY-swiggy@ybl-YESB0000001-412345678901-UPI,0000412345678901,17/10/26,349.00,,10000.00',
      '18/10/26,NEFT CR-ACME PAYROLL-OCT,N123,18/10/26,,50000.00,60000.00',
      '18/10/26,POS 4321 DMART ANDHERI,0000123,18/10/26,"1,240.50",,58759.50',
    ].join('\n')
    const n = normalize(inspect(await readTable(Buffer.from(csv), 'hdfc.csv')), TODAY, {}, 'INR')
    const raw = rowsFromTable(resolveRows(n.rows, { direction: n.defaultDirection, currency: 'INR', hasCurrency: false }))
    expect(normalizeStatement(raw, TODAY)).toEqual({
      rows: [
        { date: '2026-10-17', amount: 349, payee: 'Swiggy' },
        { date: '2026-10-18', amount: 1240.5, payee: 'Dmart Andheri' },
      ],
      credits: 1,
      dropped: 0,
    })
  })
})

describe('readSource for a csv', () => {
  it('leaves out rows in another currency instead of logging them as the account currency', async () => {
    const { readStatementTable } = await import('./statement')
    const csv = ['Date,Description,Amount,Currency', '17/10/26,Swiggy,-349,INR', '18/10/26,Amazon US,-20,USD'].join('\n')
    const raw = await readStatementTable(Buffer.from(csv), 'card.csv', TODAY, 'INR', async () => ({}))
    expect(normalizeStatement(raw, TODAY).rows).toEqual([{ date: '2026-10-17', amount: 349, payee: 'Swiggy' }])
  })

  it('calls an xlsx that inflates past the cap too big, not unreadable', async () => {
    const read = await import('./import/read')
    const { readStatementTable, StatementError } = await import('./statement')
    const spy = vi.spyOn(read, 'readTable').mockRejectedValueOnce(new read.ZipTooLarge())
    await expect(readStatementTable(Buffer.from('x'), 'big.xlsx', TODAY, 'INR', async () => ({}))).rejects.toEqual(new StatementError('too_big'))
    spy.mockRestore()
  })
})

describe('statementPrompt', () => {
  it('leaves out rows in another currency rather than reading them as the account currency', async () => {
    const { statementPrompt } = await import('./statement')
    const prompt = statementPrompt(TODAY, 'INR')
    expect(prompt).toContain('Amounts are in INR.')
    expect(prompt).toContain('Leave out any transaction shown in a currency other than INR.')
  })
})
