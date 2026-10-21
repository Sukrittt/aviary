// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const scoreCategory = vi.fn()
vi.mock('@/lib/ai/jev', () => ({ scoreCategory: (...a: unknown[]) => scoreCategory(...a) }))
const generateJSON = vi.fn()
const { extractText } = vi.hoisted(() => ({ extractText: vi.fn() }))
vi.mock('unpdf', async (orig) => {
  const real = await orig<typeof import('unpdf')>()
  extractText.mockImplementation(real.extractText)
  return { ...real, extractText: (...a: Parameters<typeof real.extractText>) => extractText(...a) }
})
vi.mock('@/lib/ai/gemini', async (orig) => ({ ...(await orig<typeof import('@/lib/ai/gemini')>()), generateJSON: (...a: unknown[]) => generateJSON(...a) }))

import {
  categorizePayees,
  normalizeStatement,
  payeeLabel,
  statementClientIds,
  markSuggestedSkips,
  rowsFromTable,
  isLockedPdf,
  readSource,
  unlockPdfText,
  MAX_STATEMENT_ROWS,
  StatementError,
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

  it('reads SBI, bill pay, card and auto-debit narrations', () => {
    expect(payeeLabel('TO TRANSFER-UPI/DR/627145001122/IRCTC/HDFC/irctc@hdfcbank/Ticket')).toBe('IRCTC')
    expect(payeeLabel('TO TRANSFER-UPI/DR/627245001123/SHARMA KIRANA/SBIN/sharmakirana@sbi/Pay')).toBe('Sharma Kirana')
    expect(payeeLabel('BIL/ONL/000987123/AIRTEL POSTPAID/AIRT991')).toBe('Airtel Postpaid')
    expect(payeeLabel('POS 4321XXXXXXXX9012 DMART ANDHERI')).toBe('Dmart Andheri')
    expect(payeeLabel('ACH D- NETFLIX ENTERTAINMENT-NFLX99812')).toBe('Netflix Entertainment')
    expect(payeeLabel('ATM/CASH WDL/ANDHERI EAST/S1AN2201')).toBe('Cash withdrawal')
    expect(payeeLabel('UPI/DR/412345678904/DR REDDYS LAB/HDFC/drreddy@hdfcbank/Payment')).toBe('Dr Reddys Lab')
  })

  it('keeps initialisms in capitals when it title-cases a shouting name', () => {
    expect(payeeLabel('TO TRANSFER-UPI/DR/627545001126/HP PETROL PUMP/SBIN/hppetrol@sbi/Fuel')).toBe('HP Petrol Pump')
    expect(payeeLabel('UPI-PVR INOX-pvrinox@hdfcbank-HDFC0000499-429111223305-UPI')).toBe('PVR Inox')
    expect(payeeLabel('BSNL MOBILE')).toBe('BSNL Mobile')
    expect(payeeLabel('LIC PREMIUM')).toBe('LIC Premium')
    expect(payeeLabel('KFC PVT LTD')).toBe('KFC Pvt Ltd')
    expect(payeeLabel('DMRC Metro Recharge')).toBe('DMRC Metro Recharge')
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

describe('a password-protected pdf', () => {
  const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name))
  const locked = fixture('locked-statement.pdf')
  const PASSWORD = '01011990'
  const auth = { userId: 'user_a' } as Parameters<typeof readSource>[0]

  it('opens with the right password and reads every page', async () => {
    const pages = await unlockPdfText(locked, PASSWORD)
    expect(pages).toHaveLength(2)
    expect(pages[0]).toContain('UPI-SWIGGY-swiggy@icici 450.00')
    expect(pages[1]).toContain('UPI-UBER-uber@axis 312.00')
  })

  it('asks for a password, then says when it was wrong', async () => {
    await expect(unlockPdfText(locked)).rejects.toEqual(new StatementError('pdf_locked'))
    await expect(unlockPdfText(locked, 'nope')).rejects.toEqual(new StatementError('pdf_password_wrong'))
  })

  it('opens one locked only against editing without asking', async () => {
    expect((await unlockPdfText(fixture('locked-statement-owner-only.pdf')))[0]).toContain('UPI-ZEPTO')
  })

  it('calls a pdf with no text in it a scan', async () => {
    extractText.mockResolvedValueOnce({ totalPages: 1, text: ['  '] })
    await expect(unlockPdfText(locked, PASSWORD)).rejects.toEqual(new StatementError('pdf_no_text'))
  })

  it('sends the text to the model, never the password or the file, and never logs the password', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    generateJSON.mockResolvedValueOnce({ transactions: [{ date: '2026-10-12', amount: 450, payee: 'Swiggy', direction: 'debit', currency: 'INR' }] })
    const raw = await readSource(auth, { kind: 'pdf', data: locked, password: PASSWORD }, TODAY, 'INR')
    expect(normalizeStatement(raw, TODAY, 'INR').rows).toEqual([{ date: '2026-10-12', amount: 450, payee: 'Swiggy' }])
    const prompt = String(generateJSON.mock.calls[0][0])
    expect(prompt).toContain('UPI-ZEPTO-zepto@ybl 1,230.50')
    expect(prompt).toContain('UPI-UBER-uber@axis 312.00')
    expect(JSON.stringify(generateJSON.mock.calls)).not.toContain(PASSWORD)
    const wrong = await readSource(auth, { kind: 'pdf', data: locked, password: `${PASSWORD}9` }, TODAY, 'INR').catch((e: Error) => e)
    expect(`${(wrong as Error).message} ${(wrong as Error).stack}`).not.toContain(PASSWORD)
    for (const spy of logs) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(PASSWORD)
      spy.mockRestore()
    }
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

  it("turns away a file that's all in another currency, by symbol, header or column", async () => {
    const { readStatementTable, StatementError } = await import('./statement')
    const read = (csv: string[], currency = 'INR') => readStatementTable(Buffer.from(csv.join('\n')), 'card.csv', TODAY, currency, async () => ({}))
    const other = new StatementError('other_currency')
    await expect(read(['Date,Description,Amount', '17/10/26,Starbucks,-$5.00', '18/10/26,Uber,-$12.40'])).rejects.toEqual(other)
    await expect(read(['Date,Description,Amount (USD)', '17/10/26,Starbucks,-5.00'])).rejects.toEqual(other)
    await expect(read(['Date,Description,Amount,Currency', '17/10/26,Starbucks,-5,USD', '18/10/26,Uber,-12,USD'])).rejects.toEqual(other)
    // A Currency column left blank doesn't hide what the header says.
    await expect(read(['Date,Description,Amount (USD),Currency', '17/10/26,Starbucks,-5.00,'])).rejects.toEqual(other)
    // The budget's own currency, or a file that names none, reads as before.
    await expect(read(['Date,Description,Amount (USD)', '17/10/26,Starbucks,-5.00'], 'USD')).resolves.toMatchObject({ transactions: [{ payee: 'Starbucks', amount: 5 }] })
    await expect(read(['Date,Description,Amount', '17/10/26,Swiggy,-349'])).resolves.toMatchObject({ transactions: [{ payee: 'Swiggy', amount: 349 }] })
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
  it('asks for the currency each amount is shown in, so code can turn the others away', async () => {
    const { statementPrompt } = await import('./statement')
    const prompt = statementPrompt(TODAY, 'GBP')
    expect(prompt).toContain('The budget is in GBP.')
    expect(prompt).toContain('currency: the ISO 4217 code')
    expect(prompt).not.toContain('Leave out any transaction shown in a currency')
  })
})

describe('normalizeStatement: currency on a screenshot', () => {
  const t = (amount: number, currency?: string) => ({ date: '2026-10-18', amount, payee: 'Swiggy', direction: 'debit', currency })

  it('turns away a screenshot that is all in another currency, instead of reading it as empty', () => {
    expect(() => normalizeStatement({ transactions: [t(500, 'INR'), t(240, 'inr')] }, TODAY, 'GBP')).toThrow(new StatementError('other_currency'))
  })
  it('leaves out the other-currency rows of a mixed one, counted as dropped, never logged as the budget currency', () => {
    const out = normalizeStatement({ transactions: [t(500, 'INR'), t(12, 'GBP'), t(8, '')] }, TODAY, 'GBP')
    expect(out.rows.map((r) => r.amount)).toEqual([12, 8])
    expect(out.dropped).toBe(1)
  })
  it('reads rows with no currency, or one it does not know, as the budget currency, as before', () => {
    expect(normalizeStatement({ transactions: [t(8), t(9, 'Rs?')] }, TODAY, 'GBP').rows).toHaveLength(2)
  })
})

describe('categorizePayees', () => {
  const categories = ['Groceries', 'Food delivery', 'Travel']
  const caller = { userId: 'u1', feature: 'statement' as const }

  it("doesn't file Swiggy under Groceries because of past Swiggy Instamart rows", async () => {
    scoreCategory.mockReset().mockResolvedValue({ choice: 'Food delivery', probability: 0.99 })
    const out = await categorizePayees(['Swiggy', 'Swiggy Instamart'], categories, { 'swiggy instamart': 'Groceries' }, caller)
    expect(out.get('Swiggy')).toEqual({ category: 'Food delivery', categoryConfidence: 0.99 })
    expect(out.get('Swiggy Instamart')).toEqual({ category: 'Groceries', categoryConfidence: 1 })
    expect(scoreCategory).toHaveBeenCalledTimes(1)
  })

  it("keeps the user's own envelope for a payee they've logged before, whatever Jev thinks", async () => {
    scoreCategory.mockReset().mockResolvedValue({ choice: 'Food delivery', probability: 1 })
    const out = await categorizePayees(['Swiggy'], categories, { swiggy: 'Groceries' }, caller)
    expect(out.get('Swiggy')).toEqual({ category: 'Groceries', categoryConfidence: 1 })
    expect(scoreCategory).not.toHaveBeenCalled()
  })

  it('asks Jev when the remembered envelope is gone', async () => {
    scoreCategory.mockReset().mockResolvedValue({ choice: 'Travel', probability: 0.9 })
    const out = await categorizePayees(['IRCTC'], categories, { irctc: 'Trains' }, caller)
    expect(out.get('IRCTC')).toEqual({ category: 'Travel', categoryConfidence: 0.9 })
  })
})
