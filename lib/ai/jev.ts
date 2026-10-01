import { experimental_evaluate as evaluate, type Experimental_EvaluationQuestion, type Experimental_EvaluationResult } from 'ai'
import { after } from 'next/server'
import { logAiUsage, type AiCaller } from './usage'
import { AI_DISABLED_MESSAGE, getSystemSettings } from '../systemSettings'

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
    after(() => logAiUsage(caller, MODEL, startedAt, {
      promptTokenCount: result.usage.inputTokens,
      candidatesTokenCount: result.usage.outputTokens,
    }, null))
    return result.answers
  } catch (err) {
    after(() => logAiUsage(caller, MODEL, startedAt, undefined, err))
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

const CATEGORY_INSTRUCTIONS = 'Which personal budgeting category does this expense item belong to?'

/** Picks the best-fit category for an expense item from the user's own list. */
export async function pickCategory(item: string, categories: string[], caller: AiCaller): Promise<string> {
  return pickChoice('category', CATEGORY_INSTRUCTIONS, { expenseItem: item }, categories, caller)
}

/** Same pick as pickCategory, plus Jev's probability, so a caller can show how sure it was. */
export async function scoreCategory(item: string, categories: string[], caller: AiCaller): Promise<ScoredChoice> {
  return scoreChoice('category', CATEGORY_INSTRUCTIONS, { expenseItem: item }, categories, caller)
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
