import { describe, it, expect } from 'vitest'
import { accountIconKey, accountLabel } from './AccountChips'

describe('account icons', () => {
  it('uses a leading emoji in the name, like categories, else the type', () => {
    expect(accountIconKey({ name: '🐷 Savings', type: 'bank' })).toBe('PiggyBank')
    expect(accountLabel({ name: '🐷 Savings' })).toBe('Savings')
    expect(accountIconKey({ name: 'Wallet', type: 'cash' })).toBe('Money')
    expect(accountIconKey({ name: 'Amex', type: 'credit_card' })).toBe('CreditCard')
    expect(accountLabel({ name: 'Wallet' })).toBe('Wallet')
  })
})
