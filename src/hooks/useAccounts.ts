import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addAccount, getAccounts, updateAccount } from '@/src/api/accounts'
import type { AccountRow, AccountType } from '@/src/types'
import { track } from '@/src/lib/analytics'
import { balanceCheckKey } from './useBalanceCheck'

export const accountsKey = ['accounts'] as const

export function useAccounts() {
  return useQuery({ queryKey: accountsKey, queryFn: getAccounts, staleTime: 60_000 })
}

/** Accounts a new row can go on: not archived, in the order they were made. */
export function liveAccounts(rows: AccountRow[] | undefined): AccountRow[] {
  return (rows ?? []).filter((a) => !a.archived)
}

function useAccountMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>, created = false) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      if (created) track('account_created')
      await qc.invalidateQueries({ queryKey: accountsKey })
      // The balance check asks about the bank accounts.
      qc.invalidateQueries({ queryKey: balanceCheckKey })
    },
  })
}

export function useAddAccount() {
  return useAccountMutation((input: { name: string; type: AccountType }) => addAccount(input), true)
}

export function useUpdateAccount() {
  return useAccountMutation((p: { id: string; updates: { name?: string; type?: AccountType; archived?: boolean } }) => updateAccount(p.id, p.updates))
}
