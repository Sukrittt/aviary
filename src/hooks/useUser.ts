import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getUser, getIdentityProviders, getSessions, getPrivacyProof, updateUser, restoreAccount, completeGuidedTour, type UserProfile } from '@/src/api/account'

export const userKey = ['user'] as const
const sessionsKey = ['user', 'sessions'] as const
const identitiesKey = ['user', 'identities'] as const
const privacyProofKey = ['user', 'privacy-proof'] as const

export function useUser() {
  return useQuery({ queryKey: userKey, queryFn: getUser, staleTime: 30_000 })
}

export function useCompleteGuidedTour() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: completeGuidedTour,
    onSuccess: (user) => qc.setQueryData(userKey, user),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<UserProfile>) => updateUser(patch),
    onMutate: async (patch) => {
      // Don't await cancelQueries — the optimistic write must land in the same tick as the
      // tap, or a segmented control flashes back to the old value for a frame first.
      qc.cancelQueries({ queryKey: userKey })
      const previous = qc.getQueryData<UserProfile>(userKey)
      if (previous) qc.setQueryData<UserProfile>(userKey, { ...previous, ...patch })
      return { previous }
    },
    // The PATCH response is already the fresh server doc — write it straight into
    // the cache instead of invalidating, which would trigger a redundant refetch
    // that flashes the same value back a moment later.
    onSuccess: (data, patch) => {
      qc.setQueryData<UserProfile>(userKey, data)
      if (patch.currencyCode) void qc.invalidateQueries({ queryKey: ['ai-brief'] })
    },
    onError: (err, _patch, context) => {
      console.warn('[useUpdateUser] update failed:', err)
      if (context?.previous) qc.setQueryData(userKey, context.previous)
    },
  })
}

/** Undoes a scheduled account deletion. Broad invalidate: every collection's data comes back too. */
export function useRestoreAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: restoreAccount,
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useSessions() {
  return useQuery({ queryKey: sessionsKey, queryFn: getSessions, staleTime: 30_000 })
}

export function useIdentities() {
  return useQuery({ queryKey: identitiesKey, queryFn: getIdentityProviders, staleTime: 30_000 })
}

export function usePrivacyProof() {
  return useQuery({ queryKey: privacyProofKey, queryFn: getPrivacyProof, staleTime: 30_000 })
}
