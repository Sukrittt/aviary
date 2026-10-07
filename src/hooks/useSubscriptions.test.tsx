import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import {
  addSubscription,
  cancelSubscription,
  deleteSubscription,
  getSubscriptions,
  reactivateSubscription,
  updateSubscription,
} from '@/src/api/subscriptions'
import {
  useAddSubscription,
  useCancelSubscription,
  useDeleteSubscription,
  useReactivateSubscription,
  useSubscriptions,
  useUpdateSubscription,
} from './useSubscriptions'
import { track } from '@/src/lib/analytics'

vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/src/api/subscriptions', () => ({
  getSubscriptions: vi.fn(),
  addSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  reactivateSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
}))

function wrapper(queryClient: QueryClient) {
  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return QueryWrapper
}

it('useSubscriptions resolves the query with the API result', async () => {
  ;(getSubscriptions as Mock).mockResolvedValue([{ service: 'Netflix' }])
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result } = renderHook(() => useSubscriptions(), { wrapper: wrapper(queryClient) })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual([{ service: 'Netflix' }])
})

// Subscriptions feed Ask Aviary's brief (Web/lib/ai/expenseContext.ts) — every
// mutation must bust ['ai-brief'] alongside ['subscriptions'] or the brief shows
// stale numbers for up to its 15min staleTime.
describe('every mutation invalidates both subscriptions and ai-brief', () => {
  it('useAddSubscription', async () => {
    ;(addSubscription as Mock).mockResolvedValue(undefined)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useAddSubscription(), { wrapper: wrapper(queryClient) })

    result.current.mutate({ service: 'Netflix', amount_inr: '649' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriptions'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  })

  it('useUpdateSubscription', async () => {
    ;(updateSubscription as Mock).mockResolvedValue(undefined)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateSubscription(), { wrapper: wrapper(queryClient) })

    result.current.mutate({ service: 'Netflix', updates: { amount_inr: '699' } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriptions'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  })

  it('useCancelSubscription', async () => {
    ;(cancelSubscription as Mock).mockResolvedValue(undefined)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCancelSubscription(), { wrapper: wrapper(queryClient) })

    result.current.mutate('Netflix')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriptions'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  })

  it('useReactivateSubscription', async () => {
    ;(reactivateSubscription as Mock).mockResolvedValue(undefined)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useReactivateSubscription(), { wrapper: wrapper(queryClient) })

    result.current.mutate('Netflix')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriptions'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  })

  it('useDeleteSubscription', async () => {
    ;(deleteSubscription as Mock).mockResolvedValue(undefined)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteSubscription(), { wrapper: wrapper(queryClient) })

    result.current.mutate('Netflix')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriptions'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ai-brief'] })
  })
})

it('useAddSubscription reports the add with its billing cycle and nothing identifying', async () => {
  ;(addSubscription as Mock).mockResolvedValue(undefined)
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const { result } = renderHook(() => useAddSubscription(), { wrapper: wrapper(queryClient) })
  result.current.mutate({ service: 'Netflix', amount_inr: '649', billing_cycle: 'monthly' } as never)
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(track).toHaveBeenCalledWith('subscription_added', { billing_cycle: 'monthly' })
})
