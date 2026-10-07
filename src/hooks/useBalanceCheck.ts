import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getBalanceStatus, resolveBalanceCheck, submitBalance, type AccountBalance, type ResolveAnswer } from '@/src/api/balanceChecks'

export const balanceCheckKey = ['balance-check'] as const

/**
 * Whether a check is due, the balance it expects, the accounts to ask about
 * and the logged meter. `fresh` refetches on mount: the expected balance
 * moves with every expense logged since the last fetch.
 */
export function useBalanceStatus({ fresh = false }: { fresh?: boolean } = {}) {
  return useQuery({
    queryKey: balanceCheckKey,
    queryFn: getBalanceStatus,
    staleTime: 5 * 60_000,
    ...(fresh ? { refetchOnMount: 'always' as const } : {}),
  })
}

export function useSubmitBalance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (accounts: AccountBalance[]) => submitBalance(accounts),
    onSuccess: () => qc.invalidateQueries({ queryKey: balanceCheckKey }),
  })
}

export function useResolveBalanceCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { id: string; answer: ResolveAnswer }) => resolveBalanceCheck(params.id, params.answer),
    onSuccess: () => qc.invalidateQueries({ queryKey: balanceCheckKey }),
  })
}
