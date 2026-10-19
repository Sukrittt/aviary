import { currencyInstruction } from '@/lib/ai/moneyBrainPrompt'
import { scrubEmDashes } from '@/lib/ai/emDash'
import { formatMoney } from '@/src/lib/currencies'
import { Type } from '@google/genai'
import { json, error, getCollection } from '@/lib/http'
import { getUserCurrency, nowForUser } from '@/lib/userCurrency'
import { getAuth, type Auth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { buildExpenseContext, factsFor, type SummarizeExpensesMeta } from '@/lib/ai/expenseContext'
import { buildBriefCandidates, rankBrief } from '@/lib/ai/briefCards'
import { BRIEF_CACHE_COLLECTION, briefCacheId } from '@/lib/ai/briefCache'
import { generateJSON } from '@/lib/ai/gemini'
import { isRateLimited } from '@/lib/rateLimit'
import { aiDisabledResponse } from '@/lib/systemSettings'
import { aiAllowanceResponse } from '@/lib/ai/allowance'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const RATE_WINDOW_MS = 60 * 60 * 1000
const SIGNED_IN_LIMIT = 30
const DEMO_LIMIT = 10
const BURST_WINDOW_MS = 60 * 1000
const BURST_SIGNED_IN_LIMIT = 5
const BURST_DEMO_LIMIT = 3

function rateLimited(auth: Auth): Promise<boolean> {
  return isRateLimited(`ai-brief:${auth.userId}`, [
    { windowMs: BURST_WINDOW_MS, limit: auth.readOnly ? BURST_DEMO_LIMIT : BURST_SIGNED_IN_LIMIT },
    { windowMs: RATE_WINDOW_MS, limit: auth.readOnly ? DEMO_LIMIT : SIGNED_IN_LIMIT },
  ])
}

// Any write to an expense, budget, category, group, subscription or holding
// drops this cache (lib/ai/briefCache.ts), so the TTL only bounds how long a
// brief can sit unchanged, not how long it can be wrong.
const CACHE_TTL_MS = 60 * 60_000

/** Sections Jev sees when it ranks candidates. The raw transaction rows aren't needed to judge relevance. */
const RANKING_SECTIONS = ['header', 'envelopes', 'trend', 'top10', 'subscriptions'] as const

/** Used when Gemini can't write the narrative. The cards carry the real content, so the brief still stands. */
function fallbackNarrative(meta: SummarizeExpensesMeta, currencyCode: string): string {
  return `You've spent ${formatMoney(meta.totalSpent, currencyCode)} of ${formatMoney(meta.totalAssigned, currencyCode)} assigned, across ${meta.txnCountThisMonth} transactions. ${meta.daysLeft} days left in the month.`
}

/**
 * Gemini writes the narrative line and nothing else: it sees the three chosen
 * cards and the month's totals, not the FACTS blob, so it has no figure to get
 * wrong and the prompt stays small.
 */
async function writeNarrative(
  meta: SummarizeExpensesMeta,
  currencyCode: string,
  caller: { userId: string; feature: 'brief' },
): Promise<string> {
  const prompt = [
    currencyInstruction(currencyCode),
    'Write the opening line of a money brief for a personal expense tracker: 1 to 2 sentences summarizing the month so far.',
    'Be warm and direct, second person, no markdown, no em dashes, use contractions.',
    'Use only the numbers below. Never estimate or invent a figure.',
    '',
    `Day ${meta.daysElapsed} of ${meta.totalDaysInMonth}, ${meta.daysLeft} days left.`,
    `Spent ${meta.totalSpent} of ${meta.totalAssigned} assigned, across ${meta.txnCountThisMonth} transactions this month.`,
  ].join('\n')

  const { narrative } = await generateJSON<{ narrative: string }>(
    prompt,
    { type: Type.OBJECT, properties: { narrative: { type: Type.STRING } }, required: ['narrative'] },
    caller,
    // The app gives up on the whole brief at 15s; past this, fallbackNarrative answers instead.
    { timeoutMs: 8_000 },
  )
  return scrubEmDashes(narrative)
}

export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate

  const aiOff = await aiDisabledResponse()
  if (aiOff) return aiOff

  const overAllowance = await aiAllowanceResponse(auth)
  if (overAllowance) return overAllowance

  const caller = { userId: auth.userId, feature: 'brief' as const }

  try {
    const [currencyCode, { date }] = await Promise.all([getUserCurrency(auth.userId), nowForUser(auth.userId)])
    const cache = await getCollection(BRIEF_CACHE_COLLECTION, auth)
    const _id = briefCacheId(auth.spaceId, `${currencyCode}|${date}`)

    const cached = await cache.findOne({ _id })
    if (cached?.builtAt instanceof Date && Date.now() - cached.builtAt.getTime() < CACHE_TTL_MS) {
      return json(cached.payload)
    }

    // Only a real rebuild costs model calls, so only a real rebuild is rate limited.
    if (await rateLimited(auth)) return error('rate limited', 429)

    const ctx = await buildExpenseContext(auth)
    const { meta } = ctx
    const candidates = buildBriefCandidates(ctx, currencyCode)

    // Ranking and the narrative both depend only on the context, never on each
    // other, so they run together instead of back to back.
    const [{ cards, questions }, narrative] = await Promise.all([
      rankBrief(candidates, factsFor(ctx.sections, RANKING_SECTIONS), caller),
      writeNarrative(meta, currencyCode, caller).catch((err) => {
        console.warn('[brief] narrative unavailable:', (err as Error).message)
        return fallbackNarrative(meta, currencyCode)
      }),
    ])

    const payload = { narrative, cards, questions, meta }
    await cache.updateOne({ _id }, { $set: { payload, builtAt: new Date() } }, { upsert: true })

    return json(payload)
  } catch (err) {
    console.error('brief: failed', err)
    return error('brief unavailable', 502)
  }
}
