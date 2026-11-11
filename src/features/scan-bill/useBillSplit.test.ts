// @vitest-environment jsdom
import { it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useBillSplit } from './useBillSplit'

it('splits products, pooled fees and discounts without losing paise', () => {
  const { result } = renderHook(() => useBillSplit())
  act(() => result.current.actions.load({ merchant: 'Shop', total: 110.5, items: [{ qty: 1, name: 'Tea', price: 100 }, { qty: 1, name: 'Delivery fee', price: 12 }, { qty: 1, name: 'Discount', price: -2 }] }))
  expect(result.current.totals.billTotal).toBe(110.5)
  expect(result.current.totals.myShare).toBe(105.25)
  act(() => result.current.actions.updateItem(result.current.items[0].key, { divisor: 2 }))
  expect(result.current.totals.myShare).toBe(55.25)
  act(() => result.current.actions.updateItem(result.current.items[0].key, { divisor: null }))
  expect(result.current.totals.myShare).toBe(5.25)
})
it('recalculates after removing items and applying bulk divisors', () => {
  const { result } = renderHook(() => useBillSplit())
  act(() => result.current.actions.load({ merchant: 'Shop', total: 100, items: [{ qty: 1, name: 'A', price: 60 }, { qty: 1, name: 'B', price: 40 }] }))
  act(() => result.current.actions.applyDivisor(result.current.items.map(i => i.key), 2))
  expect(result.current.totals.myShare).toBe(50)
  act(() => result.current.actions.removeItem(result.current.items[0].key))
  expect(result.current.totals.myShare).toBe(20)
  act(() => result.current.actions.setAllMine())
  expect(result.current.totals.myShare).toBe(40)
})
