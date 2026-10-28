import { Type } from '@google/genai'
import { json, error, getCollection } from '@/lib/http'
import { getAuth, type Auth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { EXPENSE_HEADERS, toRow } from '@/lib/models'
import { getBudgetCurrency, nowForUser } from '@/lib/userCurrency'
import { currencyInstruction } from '@/lib/ai/moneyBrainPrompt'
import { scrubEmDashes } from '@/lib/ai/emDash'
import { generateJSON } from '@/lib/ai/gemini'
import { isRateLimited } from '@/lib/rateLimit'
import { aiDisabledResponse } from '@/lib/systemSettings'
import { aiAllowanceResponse } from '@/lib/ai/allowance'
import { formatMoney } from '@/src/lib/currencies'
import { shiftMonthKey } from '@/src/lib/envelope'
import { monthRange, spikeCause, spikeFor } from '@/src/lib/monthly'
import type { ExpenseRow } from '@/src/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function rateLimited(auth: Auth): Promise<boolean> {
  return isRateLimited(`ai-spike:${auth.userId}`, [
    { windowMs: 60_000, limit: auth.readOnly ? 3 : 5 },
    { windowMs: 60 * 60_000, limit: auth.readOnly ? 10 : 30 },
  ])
}

/**
 * "Why is Food up?" on Insights. The facts come from spikeFor, recomputed here
 * from the user's own rows, and Gemini only puts them into words, so no model
 * authors a figure the user reads.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate

  const url = new URL(req.url)
  const category = url.searchParams.get('category') ?? ''
  const month = url.searchParams.get('month') ?? ''
  if (!/^\d{4}-\d{2}$/.test(month) || !category || category.length > 100) return error('category and month required', 400)

  const aiOff = await aiDisabledResponse()
  if (aiOff) return aiOff
  const overAllowance = await aiAllowanceResponse(auth)
  if (overAllowance) return overAllowance
  if (await rateLimited(auth)) return error('rate limited', 429)

  try {
    const [currencyCode, { date: today }, coll] = await Promise.all([
      getBudgetCurrency(auth),
      nowForUser(auth.userId),
      getCollection('expenses', auth),
    ])
    const docs = await coll.find({ date: { $gte: `${shiftMonthKey(month, -3)}-01`, $lte: monthRange(month).end } }).toArray()
    const rows = docs.map((d) => toRow(EXPENSE_HEADERS, d) as unknown as ExpenseRow)
    const spike = spikeFor(rows, category, month, today)
    if (!spike) return json({ explanation: null })

    const money = (n: number) => formatMoney(Math.round(n), currencyCode)
    const { why, fresh } = spikeCause(spike, money)
    const prompt = [
      currencyInstruction(currencyCode),
      `Explain in one short sentence (under 25 words) why the user's "${spike.label}" spending is up this month, for a personal expense tracker.`,
      'Be warm and direct, second person, no markdown, no em dashes, use contractions. If the facts point to one, suggest one small, concrete thing to watch.',
      'The user already sees both totals, so don\'t repeat them. Use only the facts below. Never estimate or invent a figure, a time frame, or a habit the facts do not show.',
      '',
      `${spike.label}: ${money(spike.spent)} vs a usual ${money(spike.baseline)} (up ${Math.round(spike.deltaPct)}%).`,
      `${why}.`,
      fresh.length ? `New this month: ${fresh.join(', ')}.` : '',
      `Biggest spends: ${spike.top.map((t) => `${t.item} ${money(t.amount)} on ${t.date}`).join('; ')}.`,
    ].join('\n')

    const { explanation } = await generateJSON<{ explanation: string }>(
      prompt,
      { type: Type.OBJECT, properties: { explanation: { type: Type.STRING } }, required: ['explanation'] },
      { userId: auth.userId, feature: 'spike' },
      { timeoutMs: 10_000 },
    )
    return json({ explanation: scrubEmDashes(explanation) })
  } catch (err) {
    console.error('category-spike: failed', err)
    return error('explanation unavailable', 502)
  }
}
