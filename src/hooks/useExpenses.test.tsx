import { it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { getExpenses, postExpensePayload, updateExpense, uploadExpensePhoto } from '@/src/api/expenses'
import { track, trackFirst } from '@/src/lib/analytics'
import { useExpenses, useAddExpense, useUpdateExpense, useDeleteExpense, useUploadExpensePhoto } from './useExpenses'

vi.mock('@/src/api/expenses', () => ({
  getExpenses: vi.fn(),
  mintExpensePayload: vi.fn((row) => ({ ...row, client_id: 'client-1', date: '2026-01-01', timestamp: '2026-01-01T10:00:00+05:30' })),
  postExpensePayload: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
  uploadExpensePhoto: vi.fn(),
}))

vi.mock('@/src/lib/analytics', () => ({ track: vi.fn(), trackFirst: vi.fn() }))



function wrapper(queryClient: QueryClient) {
  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return QueryWrapper
}

it('useExpenses resolves the query with the API result', async () => {
  ;(getExpenses as Mock).mockResolvedValue([{ item: 'Coffee' }])
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result } = renderHook(() => useExpenses(), { wrapper: wrapper(queryClient) })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual([{ item: 'Coffee' }])
})

it('useAddExpense invalidates both the expenses and ai-brief queries on success', async () => {
  ;(postExpensePayload as Mock).mockResolvedValue({ id: 'row-1', timestamp: '2026-01-01T10:00:00+05:30' })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const { result } = renderHook(() => useAddExpense(), { wrapper: wrapper(queryClient) })

  result.current.mutate({ item: 'Coffee', amount_inr: '150', category: 'Food' })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['expenses'] })
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['category-map'] })
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user'] })
})


// An edit can flip payment_method or move month, which rebalances the
// Credit Card envelope server-side — the budgets cache must bust too or
// Envelopes shows a stale balance until its 30s staleTime lapses.
it('useUpdateExpense also invalidates the budgets query on success', async () => {
  ;(updateExpense as Mock).mockResolvedValue(undefined)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const { result } = renderHook(() => useUpdateExpense(), { wrapper: wrapper(queryClient) })

  result.current.mutate({
    timestamp: '2026-01-01T10:00:00',
    item: 'Taxi',
    amountInr: 400,
    updates: { new_payment_method: 'credit_card' },
  })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['expenses'] })
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['budgets'] })
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['category-map'] })
})

// Mobile's "useAddExpense offline" block is deliberately absent: web has no
// pending-expense queue, so a transport failure rejects rather than enqueuing.

it('logs an expense without its category, and stamps first_expense_at', async () => {
  ;(postExpensePayload as Mock).mockResolvedValue({ id: 'row-1', timestamp: '2026-01-01T10:00:00+05:30' })
  const { result } = renderHook(() => useAddExpense(), { wrapper: wrapper(new QueryClient()) })
  result.current.mutate({ item: 'Therapy', amount_inr: '2500', category: '🧠 Therapy', payment_method: 'bank', notes: 'weekly' })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(trackFirst).toHaveBeenCalledWith('expense_logged', 'first_expense_at', { payment_method: 'bank', has_notes: true })
})

it('names the edited fields, and counts a delete', async () => {
  ;(updateExpense as Mock).mockResolvedValue({})
  const edit = renderHook(() => useUpdateExpense(), { wrapper: wrapper(new QueryClient()) })
  edit.result.current.mutate({ timestamp: 't', item: 'Coffee', amountInr: 150, updates: { new_item: 'Tea' } })
  await waitFor(() => expect(edit.result.current.isSuccess).toBe(true))
  expect(track).toHaveBeenCalledWith('expense_edited', { fields: 'new_item', changed_category: false })

  const del = renderHook(() => useDeleteExpense(), { wrapper: wrapper(new QueryClient()) })
  del.result.current.mutate({ timestamp: 't', item: 'Coffee', amountInr: 150 })
  await waitFor(() => expect(del.result.current.isSuccess).toBe(true))
  expect(track).toHaveBeenCalledWith('expense_deleted')
})

// Rows carry has_photo, and most log-dialog callers pass a no-op onSaved.
it('useUploadExpensePhoto invalidates the expenses query on success', async () => {
  ;(uploadExpensePhoto as Mock).mockResolvedValue('https://signed/url')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const { result } = renderHook(() => useUploadExpensePhoto(), { wrapper: wrapper(queryClient) })

  result.current.mutate({ id: 'row-1', image: 'QUJD' })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(uploadExpensePhoto).toHaveBeenCalledWith('row-1', 'QUJD')
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['expenses'] })
})
