import type { Experimental_EvaluationQuestion } from 'ai'
import type { Auth } from '@/lib/access'
import { runJev, type JevState } from '@/lib/ai/jev'
import { aiAllowanceResponse } from '@/lib/ai/allowance'
import { aiDisabledResponse } from '@/lib/systemSettings'
import { isRateLimited } from '@/lib/rateLimit'
import type { Role } from './presets'

/**
 * The import's only two model calls, both Jev. Neither sees a row: column
 * roles get each unplaced header with three clipped samples, groups get the
 * category names. Each degrades instead of failing the preview: no answer
 * leaves columns unplaced and categories in their fallback group.
 */

const MIN_CONFIDENCE = 0.8
const MAX_COLUMNS = 20
const MAX_CATEGORIES = 40

/** Same gating as onboarding's split-buckets: kill switch, monthly allowance, a rate limit that bounds a script. */
export async function importAiAllowed(auth: Auth): Promise<boolean> {
  if (await aiDisabledResponse()) return false
  if (await aiAllowanceResponse(auth)) return false
  return !(await isRateLimited(`import-ai:${auth.userId}`, [
    { windowMs: 60_000, limit: 10 },
    { windowMs: 86_400_000, limit: 40 },
  ]))
}

type Answer = { choice: string; probabilities?: Record<string, number> } | undefined

function confident(a: Answer, options: readonly string[]): string | null {
  if (!a || !options.includes(a.choice)) return null
  if (a.probabilities && (a.probabilities[a.choice] ?? 0) < MIN_CONFIDENCE) return null
  return a.choice
}

const ROLE_CRITERIA: Partial<Record<Role | 'ignore', string>> = {
  date: 'The date the transaction happened.',
  amount: 'The transaction amount, signed or unsigned.',
  outflow: 'Money spent or paid out (a debit or withdrawal column).',
  inflow: 'Money received or paid in (a credit or deposit column).',
  text: 'What the transaction was: a description, payee or merchant.',
  category: 'The budgeting category the transaction was filed under.',
  account: 'The account, wallet or card it was paid from.',
  note: 'A free-text note or memo.',
  type: 'Whether the row is income, an expense or a transfer.',
  currency: 'A three-letter currency code.',
  ignore: 'Anything else: balances, ids, flags, tags.',
}

/** Roles for headers alias matching couldn't place, keyed by column index. */
export async function pickColumnRoles(
  columns: { index: number; name: string; samples: string[] }[],
  userId: string,
): Promise<Record<number, Role>> {
  const ask = columns.slice(0, MAX_COLUMNS)
  if (!ask.length) return {}
  const state: JevState = {}
  const questions: Record<string, Experimental_EvaluationQuestion> = {}
  ask.forEach((c, i) => {
    state[`header_${i}`] = c.name
    state[`samples_${i}`] = c.samples
    questions[`c${i}`] = {
      type: 'choice',
      instructions: `A column in a budgeting app's transaction export has the header in header_${i} and the sample values in samples_${i}. What does the column hold?`,
      criteria: ROLE_CRITERIA,
    }
  })
  const answers = await runJev(state, questions, { userId, feature: 'import' })
  const out: Record<number, Role> = {}
  const roles = Object.keys(ROLE_CRITERIA)
  ask.forEach((c, i) => {
    const role = confident(answers[`c${i}`] as Answer, roles)
    if (role && role !== 'ignore') out[c.index] = role as Role
  })
  return out
}

const GROUP_CRITERIA: Record<string, string> = {
  Essentials: 'Spending you can’t skip: housing, bills, groceries, transport, insurance, health, debt.',
  Lifestyle: 'Spending you choose: eating out, fun, hobbies, shopping, subscriptions, travel, gifts.',
  Savings: 'Money put aside: savings, investments, an emergency fund, a goal.',
}

/**
 * The group each source category belongs in, by name only. Below the
 * confidence floor a category goes to Lifestyle, the starter for "it depends".
 */
export async function pickCategoryGroups(names: string[], groups: string[], userId: string): Promise<Record<string, string>> {
  const ask = names.slice(0, MAX_CATEGORIES)
  if (!ask.length) return {}
  const state: JevState = {}
  const questions: Record<string, Experimental_EvaluationQuestion> = {}
  const criteria = Object.fromEntries(groups.map((g) => [g, GROUP_CRITERIA[g] ?? null]))
  ask.forEach((name, i) => {
    state[`category_${i}`] = name
    questions[`c${i}`] = {
      type: 'choice',
      instructions: `Which group of a personal budget does the spending category in category_${i} belong to?`,
      criteria,
    }
  })
  const answers = await runJev(state, questions, { userId, feature: 'import' })
  // Unsure: Lifestyle where there is one, else the first group. Never a name the budget doesn't have,
  // or a later import into "🎬 Lifestyle" would make a second, bare "Lifestyle".
  const fallback = groups.includes('Lifestyle') ? 'Lifestyle' : groups[0]
  return Object.fromEntries(ask.map((name, i) => [name, confident(answers[`c${i}`] as Answer, groups) ?? fallback]))
}
