import { useCallback, useMemo } from 'react'
import { usePersistentState } from './usePersistentState'
import { track } from '../lib/analytics'
import { todayIST } from '../lib/date'

type Stored = Record<string, string>
const parse = (raw: string) => JSON.parse(raw) as Stored
const serialize = (value: Stored) => JSON.stringify(value)
const EMPTY: Stored = {}

/**
 * Categories tracked week by week, with the day each was switched on (so
 * Monday's recap only judges weeks you were tracking), remembered in this
 * browser per budget. Twin of Mobile/src/hooks/useWeeklyCategories.ts.
 */
// ponytail: browser-local like Mobile's, so web and phone don't share it. Move
// to the category row (/api/categories) when that matters.
export function useWeeklyCategories(budgetId: string | undefined) {
  const [stored, setStored] = usePersistentState<Stored>(`mc-weekly-${budgetId ?? 'personal'}`, EMPTY, parse, serialize)
  const weekly = useMemo(() => new Map(Object.entries(stored)), [stored])
  const setWeekly = useCallback(
    (category: string, on: boolean) => {
      setStored((prev) => {
        const next = { ...prev }
        if (on) next[category] = todayIST()
        else delete next[category]
        return next
      })
      track('weekly_pacing_toggled', { on })
    },
    [setStored],
  )
  return { weekly, setWeekly }
}
