import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteExpense,
  dismissDuplicate,
  getDuplicates,
  getExpenses,
  getExpensesPage,
  getRecentExpenses,
  mintExpensePayload,
  postExpensePayload,
  updateExpense,
  uploadExpensePhoto,
  type ExpensesPageParams,
  type NewExpenseRow,
  type RecentExpenses,
} from '@/src/api/expenses'
import { currentMonthKey, shiftMonthKey } from '@/src/lib/envelope'
import { budgetsKey } from '@/src/hooks/useBudgets'
import { userKey } from '@/src/hooks/useUser'
import { track, trackFirst } from '@/src/lib/analytics'

const key = ['expenses'] as const
// Ask Aviary's brief is computed from expenses too, but keyed separately —
// an edit here must bust it or it shows stale numbers for up to its 15min staleTime.
const briefKey = ['ai-brief'] as const
// The autosuggest word->category map is built from expense item/category text —
// bust it too or it shows stale suggestions for up to its 60s staleTime.
const categoryMapKey = ['category-map'] as const

export function useExpenses() {
  return useQuery({ queryKey: key, queryFn: getExpenses, staleTime: 30_000 })
}

/**
 * This month and the 3 before it: covers every screen that isn't Insights
 * (envelopes and last month's, the ~90-day unusual-amount window, widget
 * trends, recent categories). Month-aligned so the key, and the cache entry
 * every caller shares, only changes once a month.
 */
export function recentFrom(): string {
  return `${shiftMonthKey(currentMonthKey(), -3)}-01`
}

const selectRows = (d: RecentExpenses) => d.rows
const selectLastSpent = (d: RecentExpenses) => d.lastSpent

/** The recent-expenses cache key; shared with app/expense/page.tsx's server prefetch. */
export function recentExpensesKey(from: string) {
  return [...key, 'recent', from] as const
}

function recentQuery() {
  const from = recentFrom()
  return { queryKey: recentExpensesKey(from), queryFn: () => getRecentExpenses(from), staleTime: 30_000 }
}

/** Recent rows only. Use instead of `useExpenses()` unless you need all history. */
export function useRecentExpenses() {
  return useQuery({ ...recentQuery(), select: selectRows })
}

/** All-time last spend date per category, from the same fetch as `useRecentExpenses`. */
export function useLastSpent() {
  return useQuery({ ...recentQuery(), select: selectLastSpent })
}

/**
 * Server-paginated read for the Activity screen. Key starts with `'expenses'`
 * so the add/update/delete mutations below already invalidate it via their
 * existing `queryKey: key` prefix match — nothing extra to wire up.
 */
export function useExpensesPage(params: ExpensesPageParams) {
  return useQuery({
    queryKey: [...key, 'page', params] as const,
    queryFn: () => getExpensesPage(params),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export type AddExpenseResult = { id?: string; timestamp?: string; version?: number; clientId: string; pending: boolean }

export function useAddExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: NewExpenseRow): Promise<AddExpenseResult> => {
      const payload = mintExpensePayload(row)
      // Mobile catches a transport failure here and queues the payload for its
      // offline flush. Web has no queue (offline logging is out of parity
      // scope), so a failed post just throws and the caller shows an error.
      // `pending` stays in the result so callers read the same shape as their
      // mobile twins; it is never true here.
      const result = await postExpensePayload(payload)
      return { id: result.id, timestamp: result.timestamp, version: result.version, clientId: payload.client_id, pending: false }
    },
    onSuccess: (_data, row) => {
      // Both the manual screen and scan-bill's confirm land here, which is the
      // point: one event for "an expense got saved". The pageview splits them
      // after the fact. No amount, no item name and no category name either:
      // categories are named by the user, and "Therapy" is as personal as an
      // item. `first_expense_at` stamps the activation moment on the person.
      trackFirst('expense_logged', 'first_expense_at', {
        payment_method: row.payment_method ?? 'unknown',
        has_notes: !!row.notes?.trim(),
      })
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
      // A credit-card expense add/edit/delete also rebalances the Credit
      // Card envelope server-side — bust budgets too or Envelopes shows a
      // stale balance for up to its 30s staleTime.
      qc.invalidateQueries({ queryKey: budgetsKey })
      qc.invalidateQueries({ queryKey: categoryMapKey })
      // Manual creates complete a server-owned getting started milestone.
      qc.invalidateQueries({ queryKey: userKey })
    },
  })
}

// Rows carry has_photo, so a new photo has to bust the list. Most
// LogExpenseModal callers pass a no-op onSaved, so it can't rely on them.
export function useUploadExpensePhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, image }: { id: string; image: string }) => uploadExpensePhoto(id, image),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useUpdateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      id?: string
      version?: number
      timestamp: string
      item: string
      amountInr: number
      updates: Parameters<typeof updateExpense>[4]
    }) => updateExpense(params.id, params.timestamp, params.item, params.amountInr, params.updates, params.version),
    onSuccess: (_data, params) => {
      // Field names only. A category fix right after logging is the signal
      // that auto-categorising got it wrong.
      track('expense_edited', {
        fields: Object.keys(params.updates ?? {}).sort().join(','),
        changed_category: 'category' in (params.updates ?? {}),
      })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
      // See useAddExpense — this can also rebalance the CC envelope.
      qc.invalidateQueries({ queryKey: budgetsKey })
      qc.invalidateQueries({ queryKey: categoryMapKey })
    },
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { id?: string; version?: number; timestamp: string; item: string; amountInr: number }) =>
      deleteExpense(params.id, params.timestamp, params.item, params.amountInr, params.version),
    onSuccess: () => track('expense_deleted'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: briefKey })
      // See useAddExpense — this can also rebalance the CC envelope.
      qc.invalidateQueries({ queryKey: budgetsKey })
      qc.invalidateQueries({ queryKey: categoryMapKey })
    },
  })
}

/** Under the `'expenses'` prefix, so every add/edit/delete above refreshes it too. */
export function useDuplicates() {
  return useQuery({ queryKey: [...key, 'duplicates'] as const, queryFn: getDuplicates, staleTime: 30_000 })
}

export function useDismissDuplicate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: dismissDuplicate,
    onSettled: () => qc.invalidateQueries({ queryKey: [...key, 'duplicates'] }),
  })
}
