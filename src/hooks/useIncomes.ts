import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addIncome,
  addRecurringIncome,
  deleteIncome,
  deleteRecurringIncome,
  getIncomes,
  getRecurringIncomes,
  updateIncome,
  updateRecurringIncome,
  type IncomeInput,
  type RecurringIncomeInput,
} from '@/src/api/incomes'
import { budgetsKey } from './useBudgets'
import { track, type AppEvent } from '@/src/lib/analytics'

export const incomesKey = ['incomes'] as const
export const recurringIncomesKey = ['recurring-incomes'] as const
const briefKey = ['ai-brief'] as const

export function useIncomes() {
  return useQuery({ queryKey: incomesKey, queryFn: () => getIncomes(), staleTime: 30_000 })
}

export function useRecurringIncomes() {
  return useQuery({ queryKey: recurringIncomesKey, queryFn: getRecurringIncomes, staleTime: 30_000 })
}

/**
 * Every income write can move Ready to Assign (the server keeps the budget's
 * income row in step), so budgets refetch too, and a schedule change can post
 * a payday at once, so the ledger does as well.
 */
function useIncomeMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>, event?: AppEvent) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      if (event) track(event)
      await Promise.all([
        qc.invalidateQueries({ queryKey: incomesKey }),
        qc.invalidateQueries({ queryKey: recurringIncomesKey }),
        qc.invalidateQueries({ queryKey: budgetsKey }),
      ])
      qc.invalidateQueries({ queryKey: briefKey })
    },
  })
}

export function useAddIncome() {
  return useIncomeMutation((input: IncomeInput) => addIncome(input), 'income_added')
}

export function useUpdateIncome() {
  return useIncomeMutation((p: { id: string; version: number; updates: Partial<IncomeInput> }) => updateIncome(p.id, p.version, p.updates))
}

export function useDeleteIncome() {
  return useIncomeMutation((p: { id: string; version: number }) => deleteIncome(p.id, p.version))
}

export function useAddRecurringIncome() {
  return useIncomeMutation((input: RecurringIncomeInput) => addRecurringIncome(input), 'recurring_income_created')
}

export function useUpdateRecurringIncome() {
  return useIncomeMutation((p: { id: string; updates: Partial<RecurringIncomeInput> & { status?: string } }) => updateRecurringIncome(p.id, p.updates))
}

export function useDeleteRecurringIncome() {
  return useIncomeMutation((id: string) => deleteRecurringIncome(id))
}
