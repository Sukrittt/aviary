import { GoogleGenAI, ThinkingLevel, type GenerateContentResponse, type Schema } from '@google/genai'
import { logAiUsage, type AiCaller } from './usage'
import { AI_DISABLED_MESSAGE, getSystemSettings } from '../systemSettings'

/**
 * Single source of truth for Gemini client setup — both the category-suggest
 * fallback (Feature 3) and the AI transaction-scan feature import from here.
 */

// Measured 2026-09-24, same prompt back to back: 3.1-flash-lite streamed its
// first token in ~2.8s median (and 503'd repeatedly), 3.5-flash-lite in
// ~0.8s. Costs more per token ($0.30/$2.50 vs $0.25/$1.50 per 1M) but the
// Ask Aviary's replies are tens of tokens, so the latency wins outright.
const MODEL = 'gemini-3.5-flash-lite'
// Gemini answers 503 UNAVAILABLE ("experiencing high demand") in bursts. One
// retry clears most of them, and nothing has been streamed to the client yet
// at the point we retry, so replaying the call is safe.
const RETRY_STATUSES = [429, 503]
const RETRY_DELAY_MS = 700

function isRetryable(err: unknown): boolean {
  const text = String((err as Error)?.message ?? err)
  return RETRY_STATUSES.some((status) => text.includes(String(status)))
}

async function once<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (err) {
    if (!isRetryable(err)) throw err
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    return call()
  }
}

let client: GoogleGenAI | null = null

export function getGeminiClient(): GoogleGenAI {
  if (client) return client
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  client = new GoogleGenAI({ apiKey })
  return client
}

/** Backstop for the admin AI kill switch; routes check first (lib/systemSettings.ts) to answer a clean 503. */
async function assertAiEnabled() {
  if ((await getSystemSettings()).aiDisabled) throw new Error(AI_DISABLED_MESSAGE)
}

/** Runs one non-streaming call and logs its tokens, cost and outcome to `ai_usage`. */
async function tracked(
  caller: AiCaller,
  call: () => Promise<GenerateContentResponse>,
  model: string = MODEL,
): Promise<GenerateContentResponse> {
  await assertAiEnabled()
  const startedAt = Date.now()
  try {
    const response = await once(call)
    await logAiUsage(caller, model, startedAt, response.usageMetadata, null)
    return response
  } catch (err) {
    await logAiUsage(caller, model, startedAt, undefined, err)
    throw err
  }
}

// Gemini's slow spikes hit one model at a time: measured 2026-10-08, 3.5-flash-lite
// took 10-26s per call for several minutes while 3.5-flash answered in ~4s, and
// the same lite call took ~1.5s ten minutes later. So the backup is a different model.
const HEDGE_MODEL = 'gemini-3.5-flash'

/**
 * Starts `backup` if `primary` hasn't answered after `afterMs`, and takes
 * whichever answers first, aborting the other. Fails only once every started
 * call has failed; a primary that fails before the backup starts fails as usual.
 */
export function hedged<T>(
  primary: (signal: AbortSignal) => Promise<T>,
  backup: (signal: AbortSignal) => Promise<T>,
  afterMs: number,
): Promise<T> {
  const controllers = [new AbortController(), new AbortController()]
  return new Promise<T>((resolve, reject) => {
    let pending = 0
    let done = false
    const run = (i: 0 | 1, call: (signal: AbortSignal) => Promise<T>) => {
      pending++
      call(controllers[i].signal).then(
        (value) => {
          if (done) return
          done = true
          clearTimeout(timer)
          controllers[1 - i].abort()
          resolve(value)
        },
        (err) => {
          pending--
          if (done || pending > 0) return
          done = true
          clearTimeout(timer)
          reject(err)
        },
      )
    }
    const timer = setTimeout(() => {
      if (!done) run(1, backup)
    }, afterMs)
    run(0, primary)
  })
}

/**
 * Calls the model with Gemini's native structured-output mode (responseSchema
 * + responseMimeType: 'application/json') and parses the result as T. Relies
 * on the schema's own constraints (e.g. `enum`) rather than hand-validating
 * the parsed JSON afterward.
 */
export async function generateJSON<T>(
  prompt: string,
  responseSchema: Schema,
  caller: AiCaller,
  /** Race a backup model once the first call has taken this long (see `hedged`). For calls someone is waiting on. */
  { hedgeAfterMs }: { hedgeAfterMs?: number } = {},
): Promise<T> {
  const ai = getGeminiClient()
  const call = (model: string) => (abortSignal?: AbortSignal) =>
    tracked(caller, () =>
      ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema,
          abortSignal,
          ...(model === HEDGE_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
        },
      }),
    model)
  const response = hedgeAfterMs === undefined
    ? await call(MODEL)()
    : await hedged(call(MODEL), call(HEDGE_MODEL), hedgeAfterMs)
  const text = response.text
  if (!text) throw new Error('Gemini returned an empty response')
  return JSON.parse(text) as T
}

/**
 * Same structured-output call as generateJSON, but with an image part attached
 * ahead of the prompt text — used by the bill-scan route. `image.data` is raw
 * base64 (no `data:` prefix).
 */
export async function generateJSONFromImage<T>(
  prompt: string,
  image: { data: string; mimeType: string },
  responseSchema: Schema,
  caller: AiCaller,
): Promise<T> {
  const ai = getGeminiClient()
  const response = await tracked(caller, () =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ text: prompt }, { inlineData: { data: image.data, mimeType: image.mimeType } }],
      config: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    }),
  )
  const text = response.text
  if (!text) throw new Error('Gemini returned an empty response')
  return JSON.parse(text) as T
}

/**
 * Streaming chat call for the money-brain chat route. Returns the async
 * iterable stream directly — callers `for await` over it and read `.text`
 * off each chunk (same shape as the non-streaming response's `.text`).
 */
export async function streamText(
  systemInstruction: string,
  contents: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }>,
  caller: AiCaller,
  reason = false,
) {
  await assertAiEnabled()
  const ai = getGeminiClient()
  const startedAt = Date.now()
  let stream
  try {
    stream = await once(() => ai.models.generateContentStream({
      model: MODEL,
      contents,
      config: {
        systemInstruction,
        temperature: 0.4,
        // Thinking tokens count against maxOutputTokens: at 700 a reasoning
        // reply got cut off mid-sentence, so the budget grows with it.
        ...(reason ? { maxOutputTokens: 4000, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : { maxOutputTokens: 700 }),
      },
    }))
  } catch (err) {
    await logAiUsage(caller, MODEL, startedAt, undefined, err)
    throw err
  }
  return trackStream(stream, caller, startedAt)
}

/** Passes chunks through, logging usage (reported on the final chunk) once the stream ends, fails or is abandoned. */
async function* trackStream(stream: AsyncGenerator<GenerateContentResponse>, caller: AiCaller, startedAt: number) {
  let last: GenerateContentResponse | undefined
  let error: unknown = null
  try {
    for await (const chunk of stream) {
      last = chunk
      yield chunk
    }
  } catch (err) {
    error = err
    throw err
  } finally {
    await logAiUsage(caller, MODEL, startedAt, last?.usageMetadata, error)
  }
}
