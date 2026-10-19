import { isCurrencyCode } from '@/src/lib/currencies'
import { json, error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireOwnPlan } from '@/lib/billing/guard'
import { BudgetError, budgetNameError, createBudget, isBudgetEmoji, listBudgets } from '@/lib/spaces'

export const dynamic = 'force-dynamic'

/**
 * `GET /api/spaces`: every budget the person can open, plus `count`/`limit`.
 * Answers whatever the active budget is, even one they've lost access to,
 * so the app can always find its way back to a budget it may open.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)
  return json({ ...(await listBudgets(auth.userId)), activeId: auth.spaceDenied ? null : auth.spaceId }, { headers: { 'Cache-Control': 'private, no-store' } })
}

/** `POST /api/spaces` `{ name, emoji, currencyCode, copyCategories }`: a new budget, owned (and paid for) by the caller. */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  const guard = readOnlyGuard({ ...auth, spaceDenied: undefined }, 'POST')
  if (guard) return guard
  const gate = await requireOwnPlan(auth)
  if (gate) return gate

  const body = await readBody(req)
  const nameError = budgetNameError(body.name)
  if (nameError) return error(nameError)
  if (!isBudgetEmoji(body.emoji)) return error('invalid emoji')
  if (!isCurrencyCode(body.currencyCode)) return error('invalid currency code')
  try {
    const budget = await createBudget(auth, {
      name: String(body.name),
      emoji: body.emoji,
      currencyCode: body.currencyCode,
      copyCategories: body.copyCategories !== false,
    })
    return json(budget, { status: 201 })
  } catch (err) {
    if (err instanceof BudgetError && err.code === 'LIMIT_REACHED') return json({ error: err.code }, { status: 409 })
    throw err
  }
}
