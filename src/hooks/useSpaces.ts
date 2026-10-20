import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getBudgets, switchBudget, type BudgetSummary } from '@/src/api/spaces'
import { ACTIVE_BUDGET_KEY, budgetCookie } from '@/src/api/client'

export const spacesKey = ['spaces'] as const

/**
 * Every budget this person can open, plus the active one. `multi` gates every
 * piece of budget UI: with one budget the app looks exactly as it always has.
 */
export function useSpaces() {
  const q = useQuery({ queryKey: spacesKey, queryFn: getBudgets, staleTime: 60_000, retry: false })
  const budgets = q.data?.budgets ?? []
  const active: BudgetSummary | undefined = budgets.find((b) => b.id === q.data?.activeId) ?? budgets[0]
  // Remembered so that if we're thrown out of it, the next page can still say its name.
  useEffect(() => {
    if (!active) return
    try {
      localStorage.setItem(ACTIVE_BUDGET_KEY, JSON.stringify({ id: active.id, name: active.name }))
    } catch {
      // storage blocked
    }
  }, [active])
  // No personal budget (joined from an invite) and no cookie (a new browser, or
  // after logging out): the server opened a shared one here, but every other
  // request names no budget and reads the personal one that doesn't exist.
  const serverPick = budgets.find((b) => b.id === q.data?.activeId)
  useEffect(() => {
    if (serverPick && !serverPick.personal && budgetCookie() !== serverPick.id) switchBudget(serverPick)
  }, [serverPick])
  return {
    budgets,
    active,
    deleted: q.data?.deleted ?? [],
    loaded: !!q.data,
    multi: budgets.length > 1,
    /** 2+ people in the open budget: the only time "who logged what" shows. */
    shared: (active?.members.length ?? 0) > 1,
    readOnly: active?.readOnly === true,
    count: q.data?.count ?? budgets.length,
    limit: q.data?.limit ?? 0,
    atLimit: !!q.data && q.data.count >= q.data.limit,
    // The signed-out demo gets a 401 here, so no data and no entry point.
    canCreate: !!q.data,
  }
}
