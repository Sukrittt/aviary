import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useHideAmounts } from './useHideAmounts'
import { clearLocalPrefs } from '../lib/localPref'

const cookie = () => document.cookie.match(/(?:^|; )mc-amounts=([^;]*)/)?.[1]

beforeEach(() => {
  localStorage.clear()
  document.cookie = 'mc-amounts=; max-age=0; path=/'
})

describe('useHideAmounts cookie', () => {
  it('tells the server amounts are shown by default', () => {
    renderHook(() => useHideAmounts())
    expect(cookie()).toBe('shown')
  })

  it('follows the toggle', () => {
    const { result } = renderHook(() => useHideAmounts())
    act(() => result.current[1](true))
    expect(cookie()).toBe('hidden')
    act(() => result.current[1](false))
    expect(cookie()).toBe('shown')
  })

  it('reports a stored "hidden" straight away, never the hydration default', () => {
    const { result } = renderHook(() => useHideAmounts())
    act(() => result.current[1](true))
    document.cookie = 'mc-amounts=; max-age=0; path=/'
    renderHook(() => useHideAmounts())
    expect(cookie()).toBe('hidden')
  })

  it('is cleared on sign-out along with the preference it mirrors', () => {
    const { result } = renderHook(() => useHideAmounts())
    act(() => result.current[1](true))
    expect(cookie()).toBe('hidden')
    clearLocalPrefs()
    expect(cookie()).toBeUndefined()
  })
})
