import { isCurrencyCode } from '@/src/lib/currencies'
import { json, error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireOwnPlan } from '@/lib/billing/guard'
import { BudgetError, budgetNameError, requestedBudgetIcon, updateBudget } from '@/lib/spaces'
import { deleteBudget } from '@/lib/spaceMembers'
import { budgetAction } from '@/lib/spaceRoutes'

export const dynamic = 'force-dynamic'

const STATUS: Record<BudgetError['code'], number> = { NOT_FOUND: 404, NOT_OWNER: 403, LIMIT_REACHED: 409, INVALID: 400, FULL: 409, EXPIRED: 410 }

/** `PATCH /api/spaces/:id` `{ name?, icon?, currencyCode? }`. Owner only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuth(req)
  const guard = readOnlyGuard({ ...auth, spaceDenied: undefined }, 'PATCH')
  if (guard) return guard
  const gate = await requireOwnPlan(auth)
  if (gate) return gate

  const body = await readBody(req)
  if (body.name !== undefined && budgetNameError(body.name)) return error(budgetNameError(body.name)!)
  const icon = body.icon !== undefined || body.emoji !== undefined ? requestedBudgetIcon(body) : undefined
  if (icon === null) return error('invalid icon')
  if (body.currencyCode !== undefined && !isCurrencyCode(body.currencyCode)) return error('invalid currency code')
  try {
    return json(await updateBudget(auth, id, {
      name: body.name as string | undefined,
      icon,
      currencyCode: body.currencyCode as string | undefined,
    }))
  } catch (err) {
    if (err instanceof BudgetError) return json({ error: err.code }, { status: STATUS[err.code] })
    throw err
  }
}

/** `DELETE /api/spaces/:id` `{ confirmName }`: delete a budget, restorable for 30 days. Owner only, never the personal one. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuth(req)
  const guard = readOnlyGuard({ ...auth, spaceDenied: undefined }, 'DELETE')
  if (guard) return guard
  const body = await readBody(req)
  if (typeof body.confirmName !== 'string') return error('type the budget name to confirm')
  return budgetAction(() => deleteBudget(auth, id, body.confirmName as string))
}
