import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getForecast } from '@/src/api/forecast'
import { useBudgets } from './useBudgets'
import { hiddenFeatures } from '@/src/lib/features'
import { useUser } from './useUser'

export const forecastKey = ['forecast'] as const

/**
 * The month-end forecast. Off while Insights is hidden in Features, since it's
 * an insight. Keyed on the budgets query's last fetch: every expense, budget
 * and income write already refetches that. Subscription and recurring-expense
 * writes don't touch budgets, so those invalidate `forecastKey` themselves.
 */
export function useForecast() {
  const user = useUser()
  const hidden = hiddenFeatures(user.data).includes('insights')
  const budgetsAt = useBudgets().dataUpdatedAt
  const { data, isPending } = useQuery({
    queryKey: [...forecastKey, budgetsAt],
    queryFn: getForecast,
    enabled: !hidden,
    retry: 1,
    placeholderData: keepPreviousData,
  })
  // A disabled query keeps its cache, so hiding Insights must hide what it already loaded.
  // A disabled query counts as pending, so `isPending` checks hidden too. Before the
  // profile lands, hidden is only the opt-in default, so it still counts as loading.
  return { data: hidden ? undefined : data, isPending: user.isPending || (!hidden && isPending) }
}
