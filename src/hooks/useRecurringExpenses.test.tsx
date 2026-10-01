import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import {
  addRecurringExpense,
  deleteRecurringExpense,
  getRecurringExpenses,
  pauseRecurringExpense,
  resumeRecurringExpense,
  updateRecurringExpense,
} from '@/src/api/recurringExpenses'
import {
  useAddRecurringExpense,
  useDeleteRecurringExpense,
  usePauseRecurringExpense,
  useRecurringExpenses,
  useResumeRecurringExpense,
  useUpdateRecurringExpense,
} from './useRecurringExpenses'

vi.mock('@/src/api/recurringExpenses', () => ({
  getRecurringExpenses: vi.fn(),
  addRecurringExpense: vi.fn(),
  updateRecurringExpense: vi.fn(),
  pauseRecurringExpense: vi.fn(),
  resumeRecurringExpense: vi.fn(),
  deleteRecurringExpense: vi.fn(),
}))

function wrapper(queryClient: QueryClient) {
  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return QueryWrapper
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

it('useRecurringExpenses resolves the query with the API result', async () => {
  ;(getRecurringExpenses as Mock).mockResolvedValue([{ id: 'r1', item: 'Rent' }])
  const queryClient = client()
  const { result } = renderHook(() => useRecurringExpenses(), { wrapper: wrapper(queryClient) })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual([{ id: 'r1', item: 'Rent' }])
})

// Same contract as useSubscriptions: recurring expenses feed Ask Aviary's
// brief, which is keyed separately, so every mutation must bust both.
describe('every mutation invalidates both recurring-expenses and ai-brief', () => {
  const cases: [string, Mock, () => { mutate: (args: never) => void }, unknown][] = [
    [
      'useAddRecurringExpense',
      addRecurringExpense as Mock,
      useAddRecurringExpense,
      { item: 'Rent', amount_inr: '25000', category: 'Housing', frequency: 'monthly', start_date: '2026-09-15' },
    ],
    [
      'useUpdateRecurringExpense',
      updateRecurringExpense as Mock,
      useUpdateRecurringExpense,
      { id: 'r1', updates: { amount_inr: '30000' } },
    ],
    ['usePauseRecurringExpense', pauseRecurringExpense as Mock, usePauseRecurringExpense, 'r1'],
    ['useResumeRecurringExpense', resumeRecurringExpense as Mock, useResumeRecurringExpense, 'r1'],
    ['useDeleteRecurringExpense', deleteRecurringExpense as Mock, useDeleteRecurringExpense, 'r1'],
  ]

  it.each(cases)('%s', async (_name, apiMock, useHook, args) => {
    apiMock.mockResolvedValue(undefined)
    const queryClient = client()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useHook(), { wrapper: wrapper(queryClient) })

    result.current.mutate(args as never)

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['recurring-expenses'] }))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  })
})

// Regression for the "list doesn't refresh after adding" bug: a caller's
// onSuccess (which the add modal uses to trigger its close/navigate-back
// timer) must not fire until the invalidated recurring-expenses query has
// actually re-fetched — otherwise the modal can close before the new row
// lands, and the user reads it as "the list didn't refresh."
it('useAddRecurringExpense onSuccess waits for the recurring-expenses refetch to land', async () => {
  ;(addRecurringExpense as Mock).mockResolvedValue(undefined)
  let resolveRefetch!: (rows: unknown[]) => void
  ;(getRecurringExpenses as Mock)
    .mockResolvedValueOnce([]) // initial mount fetch
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefetch = resolve
        }),
    ) // the refetch triggered by invalidateQueries on add

  const queryClient = client()
  const onSuccess = vi.fn()
  const { result } = renderHook(
    () => ({ recurring: useRecurringExpenses(), add: useAddRecurringExpense() }),
    { wrapper: wrapper(queryClient) },
  )
  await waitFor(() => expect(result.current.recurring.isSuccess).toBe(true))

  result.current.add.mutate(
    { item: 'Rent', amount_inr: '25000', category: 'Housing', frequency: 'monthly', start_date: '2026-09-15' } as never,
    { onSuccess },
  )

  await waitFor(() => expect(getRecurringExpenses).toHaveBeenCalledTimes(2))
  expect(onSuccess).not.toHaveBeenCalled()

  resolveRefetch([{ id: 'r1', item: 'Rent' }])

  await waitFor(() => expect(onSuccess).toHaveBeenCalled())
})
