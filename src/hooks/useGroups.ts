import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addGroup, deleteGroup, getGroupIcons, getGroups, moveGroup, updateGroup } from '@/src/api/groups'

const key = ['groups'] as const
export const groupsKey = key
const categoriesKey = ['categories'] as const

export function useGroups() {
  return useQuery({ queryKey: key, queryFn: getGroups, staleTime: 30_000 })
}

/** Picked group icons by name; a group missing here falls back to its emoji or name. */
export function useGroupIcons(): Map<string, string> {
  const { data } = useQuery({ queryKey: [...key, 'icons'], queryFn: getGroupIcons, staleTime: 30_000 })
  return data ?? EMPTY_ICONS
}
const EMPTY_ICONS = new Map<string, string>()

export function useAddGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => addGroup(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: categoriesKey })
    },
  })
}

export function useUpdateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; newName?: string; icon?: string }) =>
      updateGroup(params.name, { newName: params.newName, icon: params.icon }),
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
