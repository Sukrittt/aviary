import { json } from './http'
import { BudgetError } from './spaces'

const STATUS: Record<BudgetError['code'], number> = { NOT_FOUND: 404, NOT_OWNER: 403, LIMIT_REACHED: 409, INVALID: 400, FULL: 409, EXPIRED: 410 }

/** Runs a budget action, answering a BudgetError as `{ error: code }` with its status. */
export async function budgetAction(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const out = await fn()
    return json(out ?? { ok: true })
  } catch (err) {
    if (err instanceof BudgetError) return json({ error: err.code }, { status: STATUS[err.code] })
    throw err
  }
}
