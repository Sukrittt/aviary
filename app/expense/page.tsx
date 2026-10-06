import '../../src/expense-redesign.css'
import '../../src/insights.css'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { pageMetadata } from '@/lib/seo'
import { callGet } from '@/lib/serverQuery'
import { OnboardingGate } from '@/components/OnboardingGate'
import type { UserProfile } from '@/src/api/account'
import { CurrencyScope } from '@/src/context/CurrencyContext'
import { budgetsKey } from '@/src/hooks/useBudgets'
import { categoriesKey } from '@/src/hooks/useCategories'
import { recentExpensesKey, recentFrom } from '@/src/hooks/useExpenses'
import { groupsKey } from '@/src/hooks/useGroups'
import { AMOUNTS_COOKIE } from '@/src/lib/localPref'
import { subscriptionsKey } from '@/src/hooks/useSubscriptions'
import { userKey } from '@/src/hooks/useUser'
import type { BudgetRow, CategoryRow, CsvResponse, ExpenseRow, SubscriptionRow } from '@/src/types'
import { ExpensePage } from '../../src/views/ExpensePage'
import { GET as budgetsGET } from '../api/budgets/route'
import { GET as categoriesGET } from '../api/categories/route'
import { GET as expensesGET } from '../api/expenses/route'
import { GET as groupsGET } from '../api/groups/route'
import { GET as subscriptionsGET } from '../api/subscriptions/route'
import { GET as userGET } from '../api/user/route'

export const metadata = pageMetadata('/expense')

/**
 * Home, rendered on the server with its data. It used to be a client page
 * that fetched after its JS loaded and hydrated, so the first meaningful paint
 * waited on the whole bundle plus an API round trip. Now the HTML carries the
 * finished screen, and the client picks up the same data from the hydrated
 * React Query cache (same keys and shapes as the hooks), so it doesn't refetch.
 *
 * A query that fails here is just left out; the hook fetches it on the client
 * exactly as before. So is everything when this browser hides amounts (or
 * hasn't said yet; see AMOUNTS_COOKIE): the HTML would show them until the
 * client applies the preference.
 */
export default async function ExpenseRoute() {
  const qc = new QueryClient()
  const from = recentFrom()
  const prefetch = (await cookies()).get(AMOUNTS_COOKIE)?.value === 'shown'

  const [user] = await Promise.all([
    callGet<UserProfile>(userGET, '/api/user').catch(() => null),
    prefetch && qc.prefetchQuery({ queryKey: budgetsKey, queryFn: async () => (await callGet<CsvResponse<BudgetRow>>(budgetsGET, '/api/budgets')).rows }),
    prefetch && qc.prefetchQuery({
      queryKey: recentExpensesKey(from),
      queryFn: async () => {
        const data = await callGet<CsvResponse<ExpenseRow> & { lastSpent?: Record<string, string> }>(expensesGET, `/api/expenses?from=${encodeURIComponent(from)}`)
        return { rows: data.rows, lastSpent: data.lastSpent ?? {} }
      },
    }),
    prefetch && qc.prefetchQuery({ queryKey: categoriesKey, queryFn: () => callGet<CategoryRow[]>(categoriesGET, '/api/categories') }),
    prefetch && qc.prefetchQuery({ queryKey: groupsKey, queryFn: () => callGet<string[]>(groupsGET, '/api/groups') }),
    prefetch && qc.prefetchQuery({ queryKey: subscriptionsKey, queryFn: async () => (await callGet<CsvResponse<SubscriptionRow>>(subscriptionsGET, '/api/subscriptions')).rows }),
  ])

  // OnboardingGate skips this route (it would otherwise put its loader in the
  // HTML), so the server makes the same call: only a profile that says "not
  // onboarded" leaves. If the profile can't be read, see `page` below.
  if (user && !user.onboardedAt) redirect('/onboarding')
  if (user) qc.setQueryData(userKey, user)

  // Profile unreadable: the server couldn't check onboarding, so the client
  // gate does, as it did before this page rendered on the server.
  const page = user ? <ExpensePage /> : <OnboardingGate recheck><ExpensePage /></OnboardingGate>
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      {/* The app-wide CurrencyProvider only learns the currency after the
          client has loaded the session; this one knows it from the first paint. */}
      {user ? <CurrencyScope code={user.currencyCode ?? 'INR'}>{page}</CurrencyScope> : page}
    </HydrationBoundary>
  )
}
