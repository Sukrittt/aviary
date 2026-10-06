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

export function useAddCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; group?: string }) => addCategory(params.name, params.group),
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
    mutationFn: (params: { name: string; updates: { newName?: string; group?: string; alertPcts?: number[] | null } }) =>
      updateCategory(params.name, params.updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
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
