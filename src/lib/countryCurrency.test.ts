import { describe, it, expect } from 'vitest'
import { currencyForCountry } from './countryCurrency'

describe('currencyForCountry', () => {
  it('maps a country to its local currency', () => {
    expect(currencyForCountry('US')).toBe('USD')
    expect(currencyForCountry('MX')).toBe('MXN')
    expect(currencyForCountry('de')).toBe('EUR')
    expect(currencyForCountry('IN')).toBe('INR')
  })
  it('falls back to INR with no or unknown country', () => {
    expect(currencyForCountry(null)).toBe('INR')
    expect(currencyForCountry('XX')).toBe('INR')
  })
})
