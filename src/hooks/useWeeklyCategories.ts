import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateCategory } from '../api/categories'
import type { CategoryRow } from '../types'
import { track } from '../lib/analytics'
import { toLocalDateString } from '../lib/date'
import { categoriesKey, useCategories } from './useCategories'

/**
 * Categories tracked week by week, with the day each was switched on (so
 * Monday's recap only judges weeks you were tracking). Stored on the category
 * itself (`weeklySince`), so web, phone and everyone sharing the budget see
 * the same switch. Twin of Mobile/src/hooks/useWeeklyCategories.ts.
 */
export function useWeeklyCategories() {
  const qc = useQueryClient()
  const { data } = useCategories()
  const weekly = useMemo(
    () => new Map((data ?? []).flatMap((c) => (c.weeklySince ? [[c.name, c.weeklySince] as const] : []))),
    [data],
  )

  // Optimistic: the switch and the row change on tap, and roll back if the
  // save fails, since the switch flipping back is the error the user sees.
  const mutation = useMutation({
    mutationFn: ({ category, since }: { category: string; since: string | null }) => updateCategory(category, { weeklySince: since }),
    onMutate: async ({ category, since }) => {
      await qc.cancelQueries({ queryKey: categoriesKey })
      const previous = qc.getQueryData<CategoryRow[]>(categoriesKey)
      qc.setQueryData<CategoryRow[]>(categoriesKey, (rows) =>
        rows?.map((c) => {
          if (c.name !== category) return c
          const { weeklySince: _, ...rest } = c
          return since ? { ...rest, weeklySince: since } : rest
        }),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(categoriesKey, context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: categoriesKey }),
  })

  function setWeekly(category: string, on: boolean) {
    mutation.mutate({ category, since: on ? toLocalDateString() : null })
    track('weekly_pacing_toggled', { on })
  }

  return { weekly, setWeekly }
}
