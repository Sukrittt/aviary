import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addHolding, deleteHolding, getHoldings, performHoldingAction, updateHolding } from '@/src/api/holdings'
import { track } from '@/src/lib/analytics'

const key = ['holdings'] as const
const eventsKey = ['holding-events'] as const

export function useHoldings() {
  return useQuery({ queryKey: key, queryFn: getHoldings, staleTime: 30_000 })
}

// Awaited (not fire-and-forget): a caller like add-holding.tsx's handleAdd
// flips to its success state as soon as mutate() resolves, then closes the
// modal on a timer. If invalidateQueries isn't awaited here, that can win the
// race against its own background refetch — the modal closes while the
// screen underneath is still showing stale data, until the next manual
// pull-to-refresh (which does await). See useHoldings.test.tsx.
async function invalidateHoldings(qc: ReturnType<typeof useQueryClient>): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: key }),
    qc.invalidateQueries({ queryKey: eventsKey }),
  ])
}

export function useAddHolding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (row: Parameters<typeof addHolding>[0]) => addHolding(row),
    onSuccess: () => {
      track('holding_added')
      return invalidateHoldings(qc)
    },
  })
}

export function useUpdateHolding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; version: number; updates: Parameters<typeof updateHolding>[1] }) =>
      updateHolding(params.name, params.updates, params.version),
    onSuccess: () => invalidateHoldings(qc),
  })
}

export function useDeleteHolding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => deleteHolding(name),
    onSuccess: () => invalidateHoldings(qc),
  })
}

export function usePerformHoldingAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: Parameters<typeof performHoldingAction>[0]) => performHoldingAction(params),
    onSuccess: () => invalidateHoldings(qc),
  })
}
