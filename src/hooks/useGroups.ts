import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addGroup, deleteGroup, getGroupRows, getGroups, moveGroup, updateGroup, type GroupRow } from '@/src/api/groups'

const key = ['groups'] as const
export const groupsKey = key
const categoriesKey = ['categories'] as const

export function useGroups() {
  return useQuery({ queryKey: key, queryFn: getGroups, staleTime: 30_000 })
}

/** Picked group icons by name; a group missing here falls back to its emoji or name. */
export function useGroupIcons(): Map<string, string> {
  const { data } = useQuery({ queryKey: [...key, 'rows'], queryFn: getGroupRows, select: toIcons, staleTime: 30_000 })
  return data ?? EMPTY
}

/** Picked group colours by name; a group missing here wears groupColor's default. */
export function useGroupColors(): Map<string, string> {
  const { data } = useQuery({ queryKey: [...key, 'rows'], queryFn: getGroupRows, select: toColors, staleTime: 30_000 })
  return data ?? EMPTY
}
// Module-level so select only reruns when the rows change.
const toIcons = (rows: GroupRow[]) => new Map(rows.flatMap((r) => (r.icon ? [[r.name, r.icon] as const] : [])))
const toColors = (rows: GroupRow[]) => new Map(rows.flatMap((r) => (r.color ? [[r.name, r.color] as const] : [])))
const EMPTY = new Map<string, string>()

export function useAddGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; icon?: string; color?: string }) =>
      addGroup(params.name, { icon: params.icon, color: params.color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: categoriesKey })
    },
  })
}

export function useUpdateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; newName?: string; icon?: string; color?: string }) =>
      updateGroup(params.name, { newName: params.newName, icon: params.icon, color: params.color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: categoriesKey })
    },
  })
}

export function useDeleteGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => deleteGroup(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: categoriesKey })
    },
  })
}

export function useMoveGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; toIndex: number }) => moveGroup(params.name, params.toIndex),
    onMutate: (params) => {
      qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<string[]>(key)
      if (previous) {
        const idx = previous.indexOf(params.name)
        if (idx !== -1) {
          const next = [...previous]
          next.splice(idx, 1)
          next.splice(params.toIndex, 0, params.name)
          qc.setQueryData<string[]>(key, next)
        }
      }
      return { previous }
    },
    onError: (_err, _params, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: categoriesKey })
    },
  })
}
