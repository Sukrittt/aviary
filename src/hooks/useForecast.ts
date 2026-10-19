import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getForecast } from '@/src/api/forecast'
import { useBudgets } from './useBudgets'
import { useHiddenFeatures } from './useUser'

/**
 * The month-end forecast. Off while Insights is hidden in Features, since it's
 * an insight. Keyed on the budgets query's last fetch: every expense, budget
 * and income write already refetches that, so the forecast follows along
 * without each mutation having to know about it.
 */
export function useForecast() {
  const hidden = useHiddenFeatures().includes('insights')
  const budgetsAt = useBudgets().dataUpdatedAt
  return useQuery({
    queryKey: ['forecast', budgetsAt],
    queryFn: getForecast,
    enabled: !hidden,
    retry: 1,
    placeholderData: keepPreviousData,
  })
}
