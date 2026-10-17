import { json, error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { pickCategory } from '@/lib/ai/jev'
import { isRateLimited } from '@/lib/rateLimit'
import { aiDisabledResponse } from '@/lib/systemSettings'
import { aiAllowanceResponse } from '@/lib/ai/allowance'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const RATE_WINDOW_MS = 60 * 60 * 1000
// One description can take a few calls while it's typed. Over the limit, the
// pick silently lands on Miscellaneous, so these sit well above real logging.
const SIGNED_IN_LIMIT = 200
const BURST_WINDOW_MS = 60 * 1000
const BURST_LIMIT = 40
const MAX_ITEM_LEN = 200
const MAX_CATEGORIES = 100
const MAX_CATEGORY_LEN = 60

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const aiOff = await aiDisabledResponse()
  if (aiOff) return aiOff

  const overAllowance = await aiAllowanceResponse(auth)
  if (overAllowance) return overAllowance

  const body = await readBody(req)
  const item = typeof body.item === 'string' ? body.item.trim().slice(0, MAX_ITEM_LEN) : ''
  const rawCategories = Array.isArray(body.categories) ? body.categories : null

  if (!item) return error('item required')
  if (
    !rawCategories ||
    rawCategories.length === 0 ||
    rawCategories.length > MAX_CATEGORIES ||
    !rawCategories.every((c) => typeof c === 'string' && c && c.length <= MAX_CATEGORY_LEN)
  )
    return error('categories must be a non-empty string array')

  const categoryList = rawCategories as string[]

  // The rate-limit check (two database round trips) runs alongside the model
  // call rather than before it. A limited request still spends one Jev call
  // (~$0.00002), which the gateway key's spend cap bounds.
  const [limited, category] = await Promise.all([
    isRateLimited(`category-suggest:${auth.userId}`, [
      { windowMs: BURST_WINDOW_MS, limit: BURST_LIMIT },
      { windowMs: RATE_WINDOW_MS, limit: SIGNED_IN_LIMIT },
    ]),
    pickCategory(item, categoryList, { userId: auth.userId, feature: 'suggest' }).catch(() => null),
  ])
  if (limited) return error('rate limited', 429)
  if (category === null) return error('category suggestion failed', 502)

  // No word overrides from here: this runs on half-typed text, and saving those
  // guesses filled the map with fragments like "ou" and "ap". Saving the expense
  // is what teaches the map.
  return json({ category })
}
