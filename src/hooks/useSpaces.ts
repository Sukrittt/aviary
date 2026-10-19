import { useQuery } from '@tanstack/react-query'
import { getBudgets, type BudgetSummary } from '@/src/api/spaces'

export const spacesKey = ['spaces'] as const

/**
 * Every budget this person can open, plus the active one. `multi` gates every
 * piece of budget UI: with one budget the app looks exactly as it always has.
 */
export function useSpaces() {
  const q = useQuery({ queryKey: spacesKey, queryFn: getBudgets, staleTime: 60_000, retry: false })
  const budgets = q.data?.budgets ?? []
  const active: BudgetSummary | undefined = budgets.find((b) => b.id === q.data?.activeId) ?? budgets[0]
  return {
    budgets,
    active,
    multi: budgets.length > 1,
    count: q.data?.count ?? budgets.length,
    limit: q.data?.limit ?? 0,
    atLimit: !!q.data && q.data.count >= q.data.limit,
    // The signed-out demo gets a 401 here, so no data and no entry point.
    canCreate: !!q.data,
  }
}
