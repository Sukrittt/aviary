import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { getCategories, updateCategory } from '@/src/api/categories'
import { useWeeklyCategories } from './useWeeklyCategories'

vi.mock('@/src/api/categories', () => ({ getCategories: vi.fn(), updateCategory: vi.fn() }))
vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return renderHook(() => useWeeklyCategories(), { wrapper })
}

describe('useWeeklyCategories', () => {
  beforeEach(() => {
    ;(getCategories as Mock).mockResolvedValue([{ name: 'Groceries', group: '', weeklySince: '2026-10-01' }, { name: 'Rent', group: '' }])
    ;(updateCategory as Mock).mockReset()
  })

  it('reads the switch from the category, not the browser', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.weekly.get('Groceries')).toBe('2026-10-01'))
    expect(result.current.weekly.has('Rent')).toBe(false)
  })

  it('saves the day it was switched on, and null to switch it off', async () => {
    ;(updateCategory as Mock).mockResolvedValue(undefined)
    const { result } = setup()
    await waitFor(() => expect(result.current.weekly.size).toBe(1))
    act(() => result.current.setWeekly('Rent', true))
    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith('Rent', { weeklySince: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }))
    act(() => result.current.setWeekly('Groceries', false))
    await waitFor(() => expect(updateCategory).toHaveBeenLastCalledWith('Groceries', { weeklySince: null }))
  })

  it('flips at once, and flips back if the save fails', async () => {
    let reject!: (e: Error) => void
    ;(updateCategory as Mock).mockReturnValue(new Promise((_, r) => (reject = r)))
    const { result } = setup()
    await waitFor(() => expect(result.current.weekly.size).toBe(1))
    act(() => result.current.setWeekly('Rent', true))
    await waitFor(() => expect(result.current.weekly.has('Rent')).toBe(true))
    ;(getCategories as Mock).mockResolvedValue([{ name: 'Groceries', group: '', weeklySince: '2026-10-01' }, { name: 'Rent', group: '' }])
    await act(async () => reject(new Error('503')))
    await waitFor(() => expect(result.current.weekly.has('Rent')).toBe(false))
  })
})
