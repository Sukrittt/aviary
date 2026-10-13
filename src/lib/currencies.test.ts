import { describe, it, expect } from 'vitest'
import { CURRENCIES, createCurrencyFormat, currencyUnit, formatMoney, formatMoneyInput, isCurrencyCode, resolveCurrency, searchCurrencies } from './currencies'

describe('display currency', () => {
  it('includes current currencies and excludes obsolete, fund and testing codes', () => {
    for (const code of ['INR', 'USD', 'EUR', 'JPY', 'AED', 'BHD', 'XCG', 'ZWG']) expect(isCurrencyCode(code)).toBe(true)
    for (const code of ['BTC', 'BGN', 'ZWL', 'ANG', 'XXX', 'XAU', 'USN', 'usd', '', null]) expect(isCurrencyCode(code)).toBe(false)
    expect(new Set(CURRENCIES.map(c => c.code)).size).toBe(CURRENCIES.length)
    expect(resolveCurrency(undefined)).toBe('INR')
    expect(resolveCurrency('unknown')).toBe('INR')
  })
  it('finds currencies by country, name, code or symbol', () => {
    const codes = (q: string) => searchCurrencies(q).map(c => c.code)
    expect(codes('korea')).toEqual(expect.arrayContaining(['KRW', 'KPW']))
    expect(codes('South Korea')).toEqual(['KRW'])
    expect(codes('japan')).toContain('JPY')
    expect(codes('germany')).toContain('EUR')
    expect(codes('₹')).toContain('INR')
    expect(codes('  ')).toHaveLength(CURRENCIES.length)
    for (const c of CURRENCIES) expect(c.countries.length).toBeGreaterThan(0)
  })
  it('changes display only, retaining precision even for zero-minor-unit currencies', () => {
    const value = 123456.78
    expect(formatMoney(value, 'INR')).toBe('₹1,23,456.78')
    expect(formatMoney(value, 'USD')).toBe('$123,456.78')
    expect(formatMoney(value, 'EUR')).toBe('€123,456.78')
    expect(formatMoney(value, 'JPY')).toBe('¥123,456.78')
    expect(formatMoney(value, 'AED')).toBe('AED 123,456.78')
    expect(value).toBe(123456.78)
    expect(formatMoney(-500, 'CAD')).toBe('-C$500')
    expect(formatMoney(-0.001, 'USD')).toBe('$0')
  })
  it('preserves partially entered amounts and trailing zeros', () => {
    expect(formatMoneyInput('', 'USD')).toBe('$0')
    expect(formatMoneyInput('1200.', 'AED')).toBe('AED 1,200.')
    expect(formatMoneyInput('1200.10', 'USD')).toBe('$1,200.10')
  })
  it('formats masks, chart labels and tour examples consistently', () => {
    const f = createCurrencyFormat('AED')
    expect(f.formatCurrency(500, true)).toBe('AED ••••')
    expect(f.formatCompact(1500)).toBe('AED 1.5k')
    expect(f.formatCompact(10, true)).toBe('AED ••')
    expect(f.currencyText('Move ₹1,400. Left: ₹••••')).toBe('Move AED 1,400. Left: AED ••••')
  })
  it('keeps simultaneous currency formatters isolated', () => {
    const usd = createCurrencyFormat('USD')
    const eur = createCurrencyFormat('EUR')
    expect(usd.formatCurrency(42)).toBe('$42')
    expect(eur.formatCurrency(42)).toBe('€42')
    expect(usd.formatCurrency(42)).toBe('$42')
  })
})

describe('currencyUnit', () => {
  it('names the everyday unit, not the ISO name', () => {
    expect(currencyUnit('INR')).toBe('rupee')
    expect(currencyUnit('USD')).toBe('dollar')
    expect(currencyUnit('MXN')).toBe('peso')
    expect(currencyUnit('EUR')).toBe('euro')
    expect(currencyUnit('JPY')).toBe('yen')
    expect(currencyUnit('GBP')).toBe('pound')
    expect(currencyUnit('CNY')).toBe('yuan')
    expect(currencyUnit('XOF')).toBe('franc')
  })

  it('falls back to the default currency for an unknown code', () => {
    expect(currencyUnit('???')).toBe('rupee')
  })
})
