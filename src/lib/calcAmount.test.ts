import { describe, expect, it } from 'vitest'
import { evaluateAmount, formatExpression, hasOperator, pushAmountKey } from './calcAmount'

const type = (keys: string[], start = '') => keys.reduce(pushAmountKey, start)

describe('pushAmountKey', () => {
  it('keeps the plain-amount rules', () => {
    expect(type(['.'])).toBe('0.')
    expect(type(['0', '0', '5'])).toBe('5')
    expect(type(['1', '.', '2', '3', '4'])).toBe('1.23')
    expect(type(['1', '.', '.'])).toBe('1.')
    expect(type('1234567890'.split(''))).toBe('123456789')
  })

  it('applies the number rules per operand', () => {
    expect(type(['5', '+', '.', '5'])).toBe('5+0.5')
    expect(type(['5', '.', '5', '+', '2', '.', '2', '5', '9'])).toBe('5.5+2.25')
    expect(type(['5', '+', '0', '0', '3'])).toBe('5+3')
  })

  it('ignores an operator on an empty amount and swaps a repeated one', () => {
    expect(type(['+'])).toBe('')
    expect(type(['5', '+', '−'])).toBe('5−')
  })

  it('collapses the running total before × and ÷', () => {
    expect(type(['5', '+', '5', '+', '5', '.', '5', '÷'])).toBe('15.5÷')
    expect(type(['3', '×'])).toBe('3×')
    expect(type(['2', '×', '3', '×'])).toBe('6×')
  })
})

describe('evaluateAmount', () => {
  it('evaluates sums and ignores a trailing operator', () => {
    expect(evaluateAmount('5+5+5')).toBe(15)
    expect(evaluateAmount('5+5+')).toBe(10)
    expect(evaluateAmount('5+5+51')).toBe(61)
    expect(evaluateAmount('20−5')).toBe(15)
  })

  it('evaluates × and ÷ with precedence, rounded to paise', () => {
    expect(evaluateAmount('15.5÷2')).toBe(7.75)
    expect(evaluateAmount('10÷3')).toBe(3.33)
    expect(evaluateAmount('2+3×4')).toBe(14)
  })

  it('treats empty and divide-by-zero as 0', () => {
    expect(evaluateAmount('')).toBe(0)
    expect(evaluateAmount('5÷0')).toBe(0)
  })
})

it('formats the expression line', () => {
  expect(hasOperator('12.5')).toBe(false)
  expect(hasOperator('5+')).toBe(true)
  expect(formatExpression('5+5+')).toBe('5 + 5 +')
})
