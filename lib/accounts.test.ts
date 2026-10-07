import { describe, it, expect } from 'vitest'
import { paymentMethodFor, parseAccountInput, accountLimitError, MAX_BANK_ACCOUNTS, MAX_ACCOUNTS } from './accounts'

describe('paymentMethodFor', () => {
  it('maps account types onto the payment methods the budget math already knows', () => {
    expect(paymentMethodFor('bank')).toBe('bank')
    expect(paymentMethodFor('cash')).toBe('cash')
    expect(paymentMethodFor('credit_card')).toBe('credit_card')
  })
})

describe('parseAccountInput', () => {
  it('trims the name and checks the type', () => {
    expect(parseAccountInput({ name: '  HDFC  ', type: 'bank' })).toEqual({ name: 'HDFC', type: 'bank' })
    expect(parseAccountInput({ name: '', type: 'bank' })).toBeNull()
    expect(parseAccountInput({ name: 'x'.repeat(31), type: 'bank' })).toBeNull()
    expect(parseAccountInput({ name: 'Wallet', type: 'crypto' })).toBeNull()
  })
  it('allows a partial patch', () => {
    expect(parseAccountInput({ name: 'Axis' }, true)).toEqual({ name: 'Axis' })
    expect(parseAccountInput({}, true)).toEqual({})
  })
  it('caps bank accounts at what the balance check takes', () => {
    expect(MAX_BANK_ACCOUNTS).toBe(5)
  })
})

describe('accountLimitError', () => {
  const live = (types: string[]) => types.map((type) => ({ type }))
  it('lets a sixth account in when it is cash or a card', () => {
    expect(accountLimitError(live(['bank', 'bank', 'bank', 'bank', 'bank']), 'cash')).toBeNull()
    expect(accountLimitError(live(['bank', 'bank', 'bank', 'bank', 'bank']), 'bank')).toMatch(/5 bank accounts/)
  })
  it('caps the total', () => {
    expect(accountLimitError(live(Array(MAX_ACCOUNTS).fill('cash')), 'cash')).toMatch(/accounts/)
  })
})
