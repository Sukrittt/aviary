import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addSubscription,
  cancelSubscription,
  deleteSubscription,
  getSubscriptions,
  reactivateSubscription,
  updateSubscription,
} from '@/src/api/subscriptions'
import { track } from '@/src/lib/analytics'

export const subscriptionsKey = ['subscriptions'] as const
const key = subscriptionsKey
// Ask Aviary's brief is computed from subscriptions too, but keyed separately —
// an edit here must bust it or it shows stale numbers for up to its 15min staleTime.
const briefKey = ['ai-brief'] as const

export function useSubscriptions() {
  return useQuery({ queryKey: key, queryFn: getSubscriptions, staleTime: 30_000 })
}

export function useAddSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (row: Parameters<typeof addSubscription>[0]) => addSubscription(row),
    onSuccess: (_, row) => {
      track('subscription_added', { billing_cycle: row.billing_cycle ?? 'unknown' })
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
    },
  })
}

export function useUpdateSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { service: string; updates: Parameters<typeof updateSubscription>[1] }) =>
      updateSubscription(params.service, params.updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
    },
  })
}

export function useCancelSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (service: string) => cancelSubscription(service),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
    },
  })
}

export function useReactivateSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (service: string) => reactivateSubscription(service),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
    },
  })
}

export function useDeleteSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (service: string) => deleteSubscription(service),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
    },
  })
}
