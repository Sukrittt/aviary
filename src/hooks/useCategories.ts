import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addCategory,
  deleteCategory,
  getCategories,
  moveCategory,
  updateCategory,
} from '@/src/api/categories'
import type { CategoryRow } from '@/src/types'
import { track } from '@/src/lib/analytics'
import { budgetsKey } from './useBudgets'
import { avatarStyleFor, splitEmoji } from '@/src/lib/emoji'

const key = ['categories'] as const
export const categoriesKey = key


// Categories sharing a group are stored contiguously; toIndex is the target position
// within that group's slice, matching how moveCategory/the backend interpret it.
function reorderWithinGroup(categories: CategoryRow[], name: string, toIndex: number): CategoryRow[] {
  const moved = categories.find((c) => c.name === name)
  if (!moved) return categories
  const group = moved.group || ''
  const groupItems = categories.filter((c) => (c.group || '') === group)
  const fromIndex = groupItems.findIndex((c) => c.name === name)
  if (fromIndex === -1) return categories
  const reordered = [...groupItems]
  const [item] = reordered.splice(fromIndex, 1)
  reordered.splice(toIndex, 0, item)

  const result: CategoryRow[] = []
  let inserted = false
  for (const c of categories) {
    if ((c.group || '') === group) {
      if (!inserted) {
        result.push(...reordered)
        inserted = true
      }
    } else {
      result.push(c)
    }
  }
  return result
}

export function useCategories() {
  return useQuery({ queryKey: key, queryFn: getCategories, staleTime: 30_000 })
}

/** Each category's picked icon by name, for rows that only carry the name. */
export function useCategoryIcons(): Map<string, string> {
  const { data } = useCategories()
  return useMemo(() => new Map((data ?? []).flatMap((c) => (c.icon ? [[c.name, c.icon] as const] : []))), [data])
}

/**
 * Picked category colours, keyed by both the stored name and its words, since
 * rows pass either ("🏠 Rent" or "Rent"). Categories without one are left out.
 */
export function useCategoryColors(): Map<string, string> {
  const { data } = useCategories()
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const c of data ?? []) {
      if (!c.color) continue
      map.set(splitEmoji(c.name).text, c.color)
      map.set(c.name, c.color)
    }
    return map
  }, [data])
}

/** avatarStyleFor with each category's picked colour, for rows that only carry the name. */
export function useCategoryStyle(): (category: string) => { background: string; color: string } {
  const colors = useCategoryColors()
  return useCallback((category: string) => avatarStyleFor(category, colors.get(category)), [colors])
}

export function useAddCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; group?: string; icon?: string; color?: string }) =>
      addCategory(params.name, params.group, params.icon, params.color),
    onSuccess: (_data, params) => {
      // Envelopes get created from two places: the setup wizard and the
      // inline "new category" row inside log-expense. $screen_name tells them
      // apart, and `grouped` says whether people use groups at all.
      track('envelope_created', { grouped: !!params.group })
      qc.invalidateQueries({ queryKey: key })
    },
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; updates: { newName?: string; group?: string; icon?: string; color?: string; alertPcts?: number[] | null } }) =>
      updateCategory(params.name, params.updates),
    onSuccess: (_data, params) => {
      qc.invalidateQueries({ queryKey: key })
      // A rename moves the budget rows server-side, and the carry is keyed by
      // category name; budgetsKey covers both (the carry sits under it).
      if (params.updates.newName) qc.invalidateQueries({ queryKey: budgetsKey })
    },
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => deleteCategory(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useMoveCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; toIndex: number }) => moveCategory(params.name, params.toIndex),
    onMutate: (params) => {
      // Don't await cancelQueries — the optimistic write must land in the same tick as the
      // drop, or the list flashes back to the old order for a frame before this applies.
      qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<CategoryRow[]>(key)
      if (previous) {
        qc.setQueryData<CategoryRow[]>(key, reorderWithinGroup(previous, params.name, params.toIndex))
      }
      return { previous }
    },
    onError: (_err, _params, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}
