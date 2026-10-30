import { it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { moveCategory } from '@/src/api/categories'
import type { CategoryRow } from '@/src/types'
import { placeInGroup, useMoveCategory, useUpdateCategory } from './useCategories'

vi.mock('@/src/api/categories', () => ({
  getCategories: vi.fn(),
  addCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  moveCategory: vi.fn(),
}))


const key = ['categories'] as const

function wrapper(queryClient: QueryClient) {
  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return QueryWrapper
}

const rows: CategoryRow[] = [
  { name: 'Rent', group: 'Home' },
  { name: 'Water', group: 'Home' },
  { name: 'Groceries', group: 'Food' },
]

it('optimistically reorders within the group on mutate', async () => {
  // Held pending (not resolved yet) so the assertion below observes the
  // optimistic write, not the post-settle state — resolved at the end so
  // the mutation actually completes and doesn't leak a pending handle.
  let resolveMove: () => void = () => {}
  ;(moveCategory as Mock).mockImplementation(
    () => new Promise<void>((resolve) => { resolveMove = resolve }),
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(key, rows)
  const { result } = renderHook(() => useMoveCategory(), { wrapper: wrapper(queryClient) })

  result.current.mutate({ name: 'Water', toIndex: 0 })

  await waitFor(() => {
    const data = queryClient.getQueryData<CategoryRow[]>(key)
    expect(data?.map((c) => c.name)).toEqual(['Water', 'Rent', 'Groceries'])
  })

  resolveMove()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
})

it('optimistically carries a category into another group at the dropped slot', async () => {
  ;(moveCategory as Mock).mockResolvedValue(undefined)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(key, rows)
  const { result } = renderHook(() => useMoveCategory(), { wrapper: wrapper(queryClient) })

  result.current.mutate({ name: 'Rent', toIndex: 0, group: 'Food' })

  await waitFor(() => {
    const data = queryClient.getQueryData<CategoryRow[]>(key)
    expect(data?.map((c) => [c.name, c.group])).toEqual([['Water', 'Home'], ['Rent', 'Food'], ['Groceries', 'Food']])
  })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(moveCategory).toHaveBeenLastCalledWith('Rent', 0, 'Food')
})

it('places a category at the end of a group, and into an empty one', () => {
  expect(placeInGroup(rows, 'Rent', 1, 'Food').map((c) => c.name)).toEqual(['Water', 'Groceries', 'Rent'])
  expect(placeInGroup(rows, 'Rent', 0, 'Empty')).toContainEqual({ name: 'Rent', group: 'Empty' })
  expect(placeInGroup(rows, 'Nope', 0, 'Food')).toBe(rows)
})

it('rolls back to the previous list when the mutation errors', async () => {
  ;(moveCategory as Mock).mockRejectedValue(new Error('network error'))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(key, rows)
  const { result } = renderHook(() => useMoveCategory(), { wrapper: wrapper(queryClient) })

  result.current.mutate({ name: 'Water', toIndex: 0 })

  await waitFor(() => expect(result.current.isError).toBe(true))
  const data = queryClient.getQueryData<CategoryRow[]>(key)
  expect(data?.map((c) => c.name)).toEqual(['Rent', 'Water', 'Groceries'])
})

// Mobile's "category cache write-through" block is deliberately absent: the
// encrypted offline category cache is mobile-only.

it('busts the budget rows and the carry when a category is renamed, both keyed by its name', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(queryClient, 'invalidateQueries')
  const { result } = renderHook(() => useUpdateCategory(), { wrapper: wrapper(queryClient) })

  await result.current.mutateAsync({ name: 'Food', updates: { icon: 'ForkKnife' } })
  expect(spy).not.toHaveBeenCalledWith({ queryKey: ['budgets'] })

  await result.current.mutateAsync({ name: 'Food', updates: { newName: 'Eating in' } })
  // ['budgets'] is a prefix of the carry's ['budgets', 'carry', month].
  expect(spy).toHaveBeenCalledWith({ queryKey: ['budgets'] })
})
