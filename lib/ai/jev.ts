import { experimental_evaluate as evaluate, type Experimental_EvaluationQuestion, type Experimental_EvaluationResult } from 'ai'
import { after } from 'next/server'
import { logAiUsage, type AiCaller } from './usage'
import { AI_DISABLED_MESSAGE, getSystemSettings } from '../systemSettings'
import { categoryHints } from './categoryHints'

/**
 * Jev (TypeSafe AI, via Vercel AI Gateway) answers typed choice/score/boolean
 * questions with probabilities instead of generating text — far faster and
 * cheaper than Gemini for pure decisions. Auth is AI_GATEWAY_API_KEY, read by
 * the gateway provider itself.
 */
const MODEL = 'typesafe-ai/jev'
const TIMEOUT_MS = 8_000

// Real items came back at 1.00 in a live check; gibberish ("zxqv 42") still scored 0.62.
// ponytail: calibrated on a handful of items; retune from override quality once real traffic lands.
const MIN_CONFIDENCE = 0.8

/** One shared state per request; every question in that request sees all of it. */
export type JevState = Record<string, string | number | boolean | null | string[] | number[]>

/**
 * Single entry point for every Jev call: kill-switch check, timeout, no
 * retries, no prompt training, and one `ai_usage` row per call.
 *
 * Must be called inside a request: the usage record is written with `after()`
 * so its database round trip never delays the reply.
 */
export async function runJev<const Q extends Record<string, Experimental_EvaluationQuestion>>(
  state: JevState,
  questions: Q,
  caller: AiCaller,
  timeoutMs: number = TIMEOUT_MS,
): Promise<Experimental_EvaluationResult<Q>['answers']> {
  if ((await getSystemSettings()).aiDisabled) throw new Error(AI_DISABLED_MESSAGE)
  const startedAt = Date.now()
  try {
    const result = await evaluate({
      model: MODEL,
      state,
      questions,
      // zeroDataRetention would be stronger but needs Vercel Pro (403 on Hobby).
      providerOptions: { gateway: { disallowPromptTraining: true } },
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(timeoutMs),
    })
    const endedAt = Date.now()
    after(() => logAiUsage(caller, MODEL, startedAt, {
      promptTokenCount: result.usage.inputTokens,
      candidatesTokenCount: result.usage.outputTokens,
    }, null, endedAt))
    return result.answers
  } catch (err) {
    const endedAt = Date.now()
    after(() => logAiUsage(caller, MODEL, startedAt, undefined, err, endedAt))
    throw err
  }
}

export interface ScoredChoice {
  /** The pick, or '' when Jev isn't confident (or picked something off the list). */
  choice: string
  /** Jev's probability for its top pick, or null when it didn't report one. */
  probability: number | null
}

/** Asks Jev a single choice question over `options` and returns its pick with the probability behind it. */
async function scoreChoice(
  answerKey: string,
  instructions: string,
  state: Record<string, string>,
  options: string[],
  caller: AiCaller,
): Promise<ScoredChoice> {
  const answers = await runJev(state, {
    [answerKey]: {
      type: 'choice',
      instructions,
      criteria: Object.fromEntries(options.map((c) => [c, null])),
    },
  } satisfies Record<string, Experimental_EvaluationQuestion>, caller)

  const { choice, probabilities } = answers[answerKey]
  if (!options.includes(choice)) return { choice: '', probability: null }
  const probability = probabilities ? (probabilities[choice] ?? 0) : null
  if (probability !== null && probability < MIN_CONFIDENCE) return { choice: '', probability }
  return { choice, probability }
}

/**
 * Asks Jev a single choice question over `options`, returning the pick or ''
 * when Jev isn't confident — callers treat '' as "no suggestion".
 */
async function pickChoice(
  answerKey: string,
  instructions: string,
  state: Record<string, string>,
  options: string[],
  caller: AiCaller,
): Promise<string> {
  return (await scoreChoice(answerKey, instructions, state, options, caller)).choice
}

const CATEGORY_INSTRUCTIONS = {
  question: 'Which of the user\'s own budget categories should this expense be filed under?',
  context: [
    'The user logs each expense in a few quick words, typed while paying, or it is a merchant or payee name read from their bank statement ("Chai Point", "Reliance Retail", "Rahul Sharma"). Most users live in India.',
    'Expect English, Hindi or Hinglish words (sabzi, doodh, dawai, kirana, daru), brand, app and shop names (Blinkit, Rapido, BESCOM), and festival terms (Diwali, Holi, Ganpati, rakhi). Some users write in other languages; read those as written.',
  ],
  rules: [
    'Work out what the money actually paid for, then pick the category meant for that kind of spending.',
    'Category names are the user\'s own and may be Hindi, Hinglish or another Indian language such as Tamil, Bengali, Marathi or Kannada ("Safar" is travel, "Tyohar" festivals, "Khana-Peena" food): read each name for what it means.',
    'A category named for a specific person, place, vehicle, event or occasion ("Mom\'s medicines", "Goa trip", "Wedding 2026") is the right home for anything plainly for it, ahead of a general category.',
    'Judge by meaning, not shared words: "phone cover" is shopping, not a phone bill; "OYO" is a hotel stay, not rent.',
    'A festival or occasion word (Diwali, Eid, Holi, wedding) says when, not what: file by what was bought. "Diwali shopping" is shopping; "Diwali sweets for neighbours" is gifts. Festival items themselves (crackers, diyas, rangoli, decorations, puja items) go to a festival category if there is one, otherwise shopping or household items. A category named after one festival ("Ganapati Expense", "Diwali 2025") is that festival\'s category and takes everything bought for it.',
    'A puja, ceremony or ritual itself (naamkaran, mundan, kirtan) is not shopping: file it under a festival, religion or donation category.',
    '"wala" or "wali" after a thing or task means the person who provides it, so it is pay for a service: "doodh wala" is the milkman, "kachra wala" the garbage collector, "jhadu wali" the cleaning help.',
    'Quick-commerce and grocery apps (Blinkit, Zepto, Instamart, BigBasket, JioMart, DMart) are groceries unless the words name something else. Swiggy or Zomato on its own is restaurant food delivery.',
    'Insurance goes by its type: LIC and term plans are life insurance, not health; health insurance is health; vehicle insurance belongs with the vehicle.',
    'An unfamiliar word is often Hindi or a regional language (Tamil, Bengali, Marathi, Kannada, Telugu), a brand, or a typo ("grocries", "medcine"): read it that way before deciding.',
  ],
}

/**
 * Asked alongside the choice, in the same call: does the list have a home for
 * this at all? A choice has to land somewhere, so this is how Jev says none fits
 * without a fake "none" option pulling probability away from real categories.
 */
const FIT_INSTRUCTIONS = {
  question: 'Is one of the budget categories in `categories` meant for the spending described in `expenseItem`?',
  // The same reading of the item as the choice question, so the two don't disagree about what it is.
  context: CATEGORY_INSTRUCTIONS.context,
  rules: CATEGORY_INSTRUCTIONS.rules,
  answer: [
    'Yes when the user would file it under one of the categories without hesitating, judged by what each name means to the user. A category the user named for a person, place, event or purpose fits whatever is plainly for it. A broad name ("Bills", "Essentials", "Lifestyle", "Home") fits everything of its kind.',
    'When the list has only one health category, it is meant for all health spending (medicines, doctor, tests); when it has only one savings or investment category, it is meant for all money set aside. That holds even when the name is short, narrow or not in English, but not for a neighbouring kind (groceries are not meals out).',
    'No when the nearest category is only loosely related (an RD deposit is not rent), when nothing on the list is meant for it, or when the words are too vague to tell what was bought ("paid", "given to Amit", "stuff").',
  ],
}

/**
 * Below this, a category pick isn't shown: a wrong pick costs the user more than no pick.
 * Lower than MIN_CONFIDENCE because the fit bar below guards the pick too; set from the eval sweep.
 */
export const MIN_CATEGORY_CONFIDENCE = 0.7
/** Below this chance that the list has a home for the item, no pick is shown. */
export const MIN_CATEGORY_FIT = 0.65

export interface CategoryAnswer extends ScoredChoice {
  /** Jev's probability that some category on the list fits the item, or null when it didn't report one. */
  fit: number | null
}

/** Jev's top category for `item`, the probability behind it, and how likely any category fits, before any bar. */
export async function categoryAnswer(item: string, categories: string[], caller: AiCaller): Promise<CategoryAnswer> {
  const hints = categoryHints(categories)
  // The fit question reads the list from state, so it gets the same descriptions the choice's options carry.
  // Sending them twice is deliberate: about 3.4k input tokens and ~100 ms more than the old question at 16 categories.
  // ponytail: grows with the list, roughly 20k tokens at the 100 categories the route allows; send names only
  // in state past ~40 categories if a long list ever shows up slow.
  const listed = categories.map((c, i) => (hints[i] ? `${c} (${hints[i]})` : c))
  const answers = await runJev({ expenseItem: item, categories: listed }, {
    category: {
      type: 'choice',
      instructions: CATEGORY_INSTRUCTIONS,
      criteria: Object.fromEntries(categories.map((c, i) => [c, hints[i]])),
    },
    fits: { type: 'boolean', instructions: FIT_INSTRUCTIONS },
  } satisfies Record<string, Experimental_EvaluationQuestion>, caller)
  const { choice, probabilities } = answers.category
  const fit = typeof answers.fits?.probability === 'number' ? answers.fits.probability : null
  if (!categories.includes(choice)) return { choice: '', probability: null, fit }
  // hasOwn: a category called "constructor" must not read Object's.
  return { choice, probability: probabilities ? (Object.hasOwn(probabilities, choice) ? probabilities[choice] : 0) : null, fit }
}

/**
 * Whether a pick is sure enough to show. A missing probability or fit answer
 * doesn't block the pick on its own; with no fit answer the choice needs MIN_CONFIDENCE.
 */
export function clearsCategoryBars(
  { probability, fit }: Pick<CategoryAnswer, 'probability' | 'fit'>,
  minProbability = MIN_CATEGORY_CONFIDENCE,
  minFit = MIN_CATEGORY_FIT,
): boolean {
  // The choice bar sits below MIN_CONFIDENCE only because the fit bar also guards the pick.
  if (fit === null) return probability === null || probability >= Math.max(minProbability, MIN_CONFIDENCE)
  return fit >= minFit && (probability === null || probability >= minProbability)
}

/** Picks the best-fit category for an expense item from the user's own list, or '' when unsure. */
export async function pickCategory(item: string, categories: string[], caller: AiCaller): Promise<string> {
  return (await scoreCategory(item, categories, caller)).choice
}

/** Same pick as pickCategory, plus Jev's probability, so a caller can show how sure it was. */
export async function scoreCategory(item: string, categories: string[], caller: AiCaller): Promise<ScoredChoice> {
  const answer = await categoryAnswer(item, categories, caller)
  return { choice: clearsCategoryBars(answer) ? answer.choice : '', probability: answer.probability }
}

/** Picks the best-fit investment type for a holding name from the app's fixed type list. */
export async function pickHoldingType(name: string, types: string[], caller: AiCaller): Promise<string> {
  return pickChoice(
    'holdingType',
    'Which investment holding type does this holding name belong to?',
    { holdingName: name },
    types,
    caller,
  )
}

const BUDGET_BUCKETS = ['need', 'want', 'savings'] as const
export type BudgetBucket = (typeof BUDGET_BUCKETS)[number]

/**
 * Tags each budget category as a need, want or savings for onboarding's
 * 50/30/20 split, in one call. Returns only the confident tags, keyed by the
 * lowercased category name; the caller treats a missing name as untagged.
 */
export async function pickBudgetBuckets(
  categories: { name: string; group: string }[],
  caller: AiCaller,
): Promise<Partial<Record<string, BudgetBucket>>> {
  if (!categories.length) return {}
  const state: JevState = {}
  const questions: Record<string, Experimental_EvaluationQuestion> = {}
  categories.forEach((c, i) => {
    state[`category_${i}`] = c.name
    state[`group_${i}`] = c.group
    questions[`c${i}`] = {
      type: 'choice',
      instructions: `In a 50/30/20 personal budget, is the category in category_${i} (filed under the group in group_${i}) a need, a want, or savings?`,
      criteria: {
        need: 'Essential spending: housing, bills, groceries, transport, insurance, health, debt payments.',
        want: 'Discretionary spending: dining out, fun, hobbies, shopping, subscriptions, gifts, people.',
        savings: 'Money set aside: emergency fund, investments, retirement, saving for a goal.',
      },
    }
  })
  const answers = await runJev(state, questions, caller)
  const out: Partial<Record<string, BudgetBucket>> = {}
  categories.forEach((c, i) => {
    const a = answers[`c${i}`] as { choice: string; probabilities?: Record<string, number> } | undefined
    if (!a || !(BUDGET_BUCKETS as readonly string[]).includes(a.choice)) return
    if (a.probabilities && (a.probabilities[a.choice] ?? 0) < MIN_CONFIDENCE) return
    out[c.name.trim().toLowerCase()] = a.choice as BudgetBucket
  })
  return out
}
