import { json, error } from '@/lib/http'
import { GET as user } from '../user/route'
import { GET as budgets } from '../budgets/route'
import { GET as carry } from '../budgets/carry/route'
import { GET as categories } from '../categories/route'
import { GET as groups } from '../groups/route'
import { GET as spaces } from '../spaces/route'
import { GET as accounts } from '../accounts/route'
import { GET as billingStatus } from '../billing/status/route'
import { GET as categoryMap } from '../category-map/route'
import { GET as incomes } from '../incomes/route'
import { GET as recurringIncomes } from '../recurring-incomes/route'
import { GET as importStatus } from '../import/status/route'
import { GET as changelogLatest } from '../changelog/latest/route'
import { GET as wrappedStatus } from '../wrapped/status/route'
import { GET as duplicates } from '../expenses/duplicates/route'
import { GET as recap } from '../recap/route'
import { GET as recurringSuggestions } from '../recurring-expenses/suggestions/route'
import { GET as systemStatus } from '../system/status/route'

export const dynamic = 'force-dynamic'

/**
 * The cheap reads every app open needs. Expenses and the forecast stay their
 * own calls: they're the heavy ones, and the slowest read here holds back
 * the whole answer.
 */
const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  '/api/user': user,
  '/api/budgets': budgets,
  '/api/budgets/carry': carry,
  '/api/categories': categories,
  '/api/groups': groups,
  '/api/spaces': spaces,
  '/api/accounts': accounts,
  '/api/billing/status': billingStatus,
  '/api/category-map': categoryMap,
  '/api/incomes': incomes,
  '/api/recurring-incomes': recurringIncomes,
  '/api/import/status': importStatus,
  '/api/changelog/latest': changelogLatest,
  '/api/wrapped/status': wrappedStatus,
  '/api/expenses/duplicates': duplicates,
  '/api/recap': recap,
  '/api/recurring-expenses/suggestions': recurringSuggestions,
  '/api/system/status': systemStatus,
}

const MAX_PATHS = 30

export type AppOpenSlice = { status: number; body: unknown }

/**
 * `GET /api/app-open?p=/api/user&p=/api/groups?icons=1&…`: the ~19 requests
 * of an app open in one round trip. On Android each one queued behind
 * OkHttp's per-host cap and, after a resume, a fresh TLS handshake, so the
 * burst's slowest request had a p90 of 2.6s.
 *
 * Each path runs its own route's GET with this request's headers, so auth,
 * the budget header, the subscription gate and every response are exactly
 * what the separate call would get. A path that isn't listed answers 404.
 * The app falls back to the real route for any slice that isn't a 200, so a
 * 401, 402 or 403 is still handled where it always was.
 */
export async function GET(req: Request) {
  const paths = new URL(req.url).searchParams.getAll('p')
  if (paths.length === 0 || paths.length > MAX_PATHS) return error(`1 to ${MAX_PATHS} p values required`)
  const slices = await Promise.all(paths.map(async (p) => [p, await run(req, p)] as const))
  return json(Object.fromEntries(slices), { headers: { 'Cache-Control': 'private, no-store' } })
}

async function run(req: Request, path: string): Promise<AppOpenSlice> {
  const origin = new URL(req.url).origin
  let target: URL
  try {
    target = new URL(path, origin)
  } catch {
    return { status: 404, body: null }
  }
  const handler = target.origin === origin ? HANDLERS[target.pathname] : undefined
  if (!handler) return { status: 404, body: null }
  try {
    const res = await handler(new Request(target, { headers: req.headers }))
    return { status: res.status, body: await res.json().catch(() => null) }
  } catch (err) {
    // A throw would 500 the separate call too; this keeps the other slices.
    console.error(`[app-open] ${target.pathname} failed:`, err)
    return { status: 500, body: null }
  }
}
