import { json, error } from '@/lib/http'
import { nowForUser } from '@/lib/userCurrency'
import { getAuth, type Auth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { cachedRead } from '@/lib/cache'
import { currentEdition, readRecap } from '@/lib/wrapped'
import { judgeWrapped, type WrappedJudgement } from '@/lib/ai/wrappedPersona'
import { aiAllowanceResponse } from '@/lib/ai/allowance'
import { isRateLimited } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

const NO_JUDGEMENT: WrappedJudgement = { persona: null, treatCategory: null }

/** `YYYY-MM` only. Anything else is a fresh cache key, and so a fresh paid Jev call. */
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const RATE_WINDOW_MS = 60 * 60 * 1000
const SIGNED_IN_LIMIT = 20
const DEMO_LIMIT = 10

/** Counted per Jev call, not per request: a cached persona costs nothing, so it isn't limited. */
function rateLimited(auth: Auth): Promise<boolean> {
  return isRateLimited(`wrapped-judgement:${auth.userId}`, {
    windowMs: RATE_WINDOW_MS,
    limit: auth.readOnly ? DEMO_LIMIT : SIGNED_IN_LIMIT,
  })
}

/**
 * Jev's read of a month, served apart from the recap so Wrapped renders
 * without waiting on it.
 *
 * Cached under its own base on purpose: an expense write calls
 * `invalidate('wrapped', ...)`, and busting a *closed* month's persona because
 * the user logged today's lunch would re-pay the Jev call on every visit. The
 * trade is that editing an old expense leaves that month's persona stale —
 * fine for a vibe, and the recap numbers beside it still update.
 *
 * A judgement with nothing in it throws rather than returning, so a gateway
 * outage isn't cached as "no persona" for the rest of the month. That same
 * uncached path is why the AI allowance and rate limit sit inside the loader:
 * without them, a month Jev can't judge confidently re-bills on every visit.
 * Either one tripping answers "no persona" (200), since the persona is a
 * garnish on Wrapped, not something to show an error for.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const month = new URL(req.url).searchParams.get('month') ?? currentEdition((await nowForUser(auth.userId)).date)
  if (!MONTH_RE.test(month)) return error('invalid month')

  const judgement = await cachedRead(
    'wrapped-judgement',
    auth.userId,
    async () => {
      if (await aiAllowanceResponse(auth)) throw new Error('over AI allowance')
      if (await rateLimited(auth)) throw new Error('rate limited')
      const result = await judgeWrapped(await readRecap(auth, month), { userId: auth.userId, feature: 'wrapped' })
      if (!result.persona && !result.treatCategory) throw new Error('no judgement to cache')
      return result
    },
    month,
  ).catch(() => NO_JUDGEMENT)

  return json(judgement)
}
