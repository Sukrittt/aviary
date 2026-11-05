import { describe, expect, it } from 'vitest'
import { expenseInputError, validDate, validMoney, validMonth } from './inputValidation'

describe('validMoney', () => {
  it('takes plain decimal amounts as number or string, paise included', () => {
    for (const v of [0, 450, '450', '450.00', ' 12.5 ', 0.01, '1000000000000']) expect(validMoney(v)).toBe(true)
  })

  it('refuses what is not a plain amount', () => {
    for (const v of ['1e3', '1,000', '₹500', '', ' ', '.5', '5.', 'NaN', 'Infinity', NaN, Infinity, 1e21, null, undefined, {}, [], true]) {
      expect(validMoney(v)).toBe(false)
    }
  })

  it('caps at a trillion, either sign', () => {
    expect(validMoney('1000000000000.01')).toBe(false)
    expect(validMoney('-1000000000000.01', true)).toBe(false)
  })

  it('only takes a negative when asked to', () => {
    expect(validMoney('-500')).toBe(false)
    expect(validMoney(-500)).toBe(false)
    expect(validMoney('-500', true)).toBe(true)
  })
})

describe('validMonth and validDate', () => {
  it('takes real months and dates only', () => {
    expect(validMonth('2026-12')).toBe(true)
    for (const v of ['2026-13', '2026-00', '2026-1', '26-01', '1899-12', 202612]) expect(validMonth(v)).toBe(false)
    expect(validDate('2028-02-29')).toBe(true)
    for (const v of ['2026-02-29', '2026-02-30', '2026-04-31', '2026-1-05', '2026-01-05T00:00:00Z']) expect(validDate(v)).toBe(false)
  })
})

describe('expenseInputError', () => {
  const ok = { item: 'Chai', category: 'Food', amount_inr: '20' }

  it('accepts a complete new expense', () => {
    expect(expenseInputError(ok)).toBeNull()
  })

  it('needs an item, a category and a positive amount on a new expense', () => {
    expect(expenseInputError({ ...ok, item: '  ' })).toBe('invalid item')
    expect(expenseInputError({ ...ok, category: '' })).toBe('invalid category')
    expect(expenseInputError({ item: 'Chai', category: 'Food' })).toMatch(/amount/)
    expect(expenseInputError({ ...ok, amount_inr: '0' })).toMatch(/amount/)
  })

  it('never lets a client log a negative amount: a refund you log is one-off income, not a negative spend', () => {
    expect(expenseInputError({ ...ok, amount_inr: '-20' })).toMatch(/amount/)
    expect(expenseInputError({ amount_inr: '-20' }, true)).toMatch(/amount/)
  })

  it('lets only the import book a refund, as a negative spend, and never a zero one', () => {
    expect(expenseInputError({ ...ok, amount_inr: '-20' }, false, true)).toBeNull()
    expect(expenseInputError({ ...ok, amount_inr: '0' }, false, true)).toMatch(/amount/)
  })

  it('lets an edit correct an amount to zero, and checks only the fields it sends', () => {
    expect(expenseInputError({ amount_inr: '0' }, true)).toBeNull()
    expect(expenseInputError({ category: 'Travel' }, true)).toBeNull()
    expect(expenseInputError({ category: '' }, true)).toBe('invalid category')
  })

  it('refuses an impossible date and a timestamp that is not one', () => {
    expect(expenseInputError({ ...ok, date: '2026-02-30' })).toBe('invalid date')
    expect(expenseInputError({ ...ok, timestamp: '2026-10-05T24:00:00' })).toBe('invalid timestamp')
    expect(expenseInputError({ ...ok, timestamp: '2026-10-05T23:30:00+05:30' })).toBeNull()
  })

  it('takes only the payment methods the app knows', () => {
    for (const m of ['bank', 'cash', 'credit_card']) expect(expenseInputError({ ...ok, payment_method: m })).toBeNull()
    expect(expenseInputError({ ...ok, payment_method: 'Credit Card' })).toBe('invalid payment method')
  })
})
