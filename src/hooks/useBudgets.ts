import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addBudget, deleteBudget, getBudgets, transferBudget, updateBudget } from '@/src/api/budgets'
import type { BudgetRow } from '@/src/types'
import { track } from '@/src/lib/analytics'

export const budgetsKey = ['budgets'] as const
const key = budgetsKey
// Ask Aviary's brief is computed from budgets too, but keyed separately —
// an edit here must bust it or it shows stale numbers for up to its 15min staleTime.
const briefKey = ['ai-brief'] as const

export function useBudgets() {
  return useQuery({ queryKey: key, queryFn: getBudgets, staleTime: 30_000 })
}

/** Refetches budgets past staleTime, for a save whose value is derived from
 * other rows and so must not trust what the screen loaded a while ago. */
export function useFreshBudgets() {
  const qc = useQueryClient()
  return () => qc.fetchQuery({ queryKey: key, queryFn: getBudgets, staleTime: 0 })
}

export function useAddBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (row: Omit<BudgetRow, 'rolled_over' | 'version'> & { rolled_over?: string }) => addBudget(row),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
    },
  })
}

export function useUpdateBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { month: string; category: string; version: number; updates: Partial<BudgetRow & { newCategory?: string }> }) =>
      updateBudget(params.month, params.category, params.updates, params.version),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
    },
  })
}

export function useTransferBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { month: string; to: string; sources: { category: string; amount: number }[] }) =>
      transferBudget(params.month, params.to, params.sources),
    onSuccess: (_data, params) => {
      // How many envelopes people raid to cover one is the interesting shape
      // here. The amounts themselves stay out.
      track('money_moved', { sources_count: params.sources.length })
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
    },
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { month: string; category: string }) => deleteBudget(params.month, params.category),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
    },
  })
}
