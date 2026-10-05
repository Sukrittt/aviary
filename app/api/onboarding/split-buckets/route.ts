import { json, error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { getDb } from '@/lib/mongodb'
import { pickBudgetBuckets } from '@/lib/ai/jev'
import { isRateLimited } from '@/lib/rateLimit'
import { aiDisabledResponse } from '@/lib/systemSettings'
import { aiAllowanceResponse } from '@/lib/ai/allowance'
import type { UserDoc } from '@/lib/users'
import { unknownCategories } from '@/src/lib/budgetSplit'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Onboarding asks once per visit to the assign step, so a real user stays far
// under these. They bound a script, not a person.
const BURST_WINDOW_MS = 60 * 1000
const BURST_LIMIT = 5
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000
const DAY_LIMIT = 20
const MAX_CATEGORIES = 30
const MAX_NAME_LEN = 60

/**
 * Tags the user's own onboarding categories as need/want/savings with Jev,
 * for the assign step's 50/30/20 split. Default category names are tagged on
 * the client and filtered out here too, so they never reach the model.
 *
 * Only for an account still in onboarding: once set up, there is no split to
 * suggest, and this must not become a free general-purpose classifier.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth, { setup: true })
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  const raw = Array.isArray(body.categories) ? body.categories : null
  const valid =
    raw &&
    raw.length > 0 &&
    raw.length <= MAX_CATEGORIES &&
    raw.every(
      (c) =>
        c &&
        typeof c === 'object' &&
        typeof c.name === 'string' &&
        c.name.trim() &&
        c.name.length <= MAX_NAME_LEN &&
        typeof c.group === 'string' &&
        c.group.length <= MAX_NAME_LEN,
    )
  if (!valid) return error('categories must be 1 to 30 { name, group } pairs')

  const categories = unknownCategories(
    (raw as { name: string; group: string }[]).map((c) => ({ key: '', name: c.name, group: c.group })),
  )
  if (!categories.length) return json({ buckets: {} })

  const user = await (await getDb())
    .collection<UserDoc>('users')
    .findOne({ _id: auth.userId }, { projection: { onboardedAt: 1 } })
  if (user?.onboardedAt) return error('already onboarded', 403)

  const aiOff = await aiDisabledResponse()
  if (aiOff) return aiOff
  const overAllowance = await aiAllowanceResponse(auth)
  if (overAllowance) return overAllowance

  // Checked before the model call, not alongside it: a limited request costs nothing.
  const limited = await isRateLimited(`split-buckets:${auth.userId}`, [
    { windowMs: BURST_WINDOW_MS, limit: BURST_LIMIT },
    { windowMs: DAY_WINDOW_MS, limit: DAY_LIMIT },
  ])
  if (limited) return error('rate limited', 429)

  const buckets = await pickBudgetBuckets(categories, { userId: auth.userId, feature: 'onboarding' }).catch(() => null)
  if (!buckets) return error('bucket suggestion failed', 502)
  return json({ buckets })
}
