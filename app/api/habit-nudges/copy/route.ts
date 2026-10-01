import { json, error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { isRateLimited } from '@/lib/rateLimit'
import { aiDisabledResponse } from '@/lib/systemSettings'
import { writeNudgeCopy } from '@/lib/ai/nudgeCopy'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// The phone asks once per new habit and caches the answer, so a few a day is
// already generous. No AI allowance gate: see lib/ai/allowance.ts.
const DAY_MS = 24 * 60 * 60 * 1000
const DAILY_LIMIT = 20

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const aiOff = await aiDisabledResponse()
  if (aiOff) return aiOff

  const body = await readBody(req)
  const item = typeof body.item === 'string' ? body.item.trim() : ''
  const category = typeof body.category === 'string' ? body.category.trim() : ''
  const weekdays = Array.isArray(body.weekdays) ? body.weekdays : []
  const minute = body.minute
  if (!item || !category) return error('item and category required')
  if (!weekdays.length || !weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return error('weekdays must be 0-6')
  if (!Number.isInteger(minute) || (minute as number) < 0 || (minute as number) >= 24 * 60) return error('minute must be 0-1439')

  if (await isRateLimited(`nudge-copy:${auth.userId}`, { windowMs: DAY_MS, limit: DAILY_LIMIT })) return error('rate limited', 429)

  const copy = await writeNudgeCopy({ item, category, weekdays: weekdays as number[], minute: minute as number }, auth.userId).catch(() => null)
  if (!copy) return error('copy unavailable', 502)
  return json(copy)
}
