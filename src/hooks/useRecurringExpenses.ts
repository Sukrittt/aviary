import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addRecurringExpense,
  deleteRecurringExpense,
  getRecurringExpenses,
  pauseRecurringExpense,
  resumeRecurringExpense,
  updateRecurringExpense,
} from '@/src/api/recurringExpenses'
import { track, type AppEvent } from '@/src/lib/analytics'

export const recurringExpensesKey = ['recurring-expenses'] as const
const key = recurringExpensesKey
// Same reasoning as useSubscriptions: Ask Aviary's brief factors these in but
// is keyed separately, so an edit here must bust it or the brief shows stale
// numbers for up to its 15min staleTime.
const briefKey = ['ai-brief'] as const

export function useRecurringExpenses() {
  return useQuery({ queryKey: key, queryFn: getRecurringExpenses, staleTime: 30_000 })
}

function useRecurringMutation<TArgs>(mutationFn: (args: TArgs) => Promise<void>, event?: AppEvent) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      if (event) track(event)
      // Awaited so a caller's own onSuccess (the add modal's close/navigate-back
      // timer) doesn't fire until the list has actually refetched — otherwise the
      // modal can dismiss back to a list that hasn't picked up the change yet.
      await qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
    },
  })
}

export function useAddRecurringExpense() {
  return useRecurringMutation(addRecurringExpense, 'recurring_created')
}

export function useUpdateRecurringExpense() {
  return useRecurringMutation((params: { id: string; updates: Parameters<typeof updateRecurringExpense>[1] }) =>
    updateRecurringExpense(params.id, params.updates),
  )
}

export function usePauseRecurringExpense() {
  return useRecurringMutation(pauseRecurringExpense)
}

export function useResumeRecurringExpense() {
  return useRecurringMutation(resumeRecurringExpense)
}

export function useDeleteRecurringExpense() {
  return useRecurringMutation(deleteRecurringExpense)
}
