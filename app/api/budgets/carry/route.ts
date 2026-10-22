import { json, error } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { validMonth } from '@/lib/inputValidation'
import { computeCarry } from '@/lib/budgetCarry'

export const dynamic = 'force-dynamic'

/** GET ?month=YYYY-MM: what earlier months left behind for that month. See
 * computeCarry. Not server-cached: it's recomputed from the rows every read,
 * so a write never needs to bust anything here. */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth, { setup: true })
  if (gate) return gate
  const month = new URL(req.url).searchParams.get('month')
  if (!validMonth(month)) return error('month (YYYY-MM) required')
  return json(await computeCarry(auth, month))
}
