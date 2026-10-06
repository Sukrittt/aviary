import type { GenerateContentResponseUsageMetadata } from '@google/genai'
import { getDb } from '../mongodb'
import { estimateCostUsd } from './pricing'

export const AI_USAGE = 'ai_usage'

export type AiFeature = 'chat' | 'brief' | 'scan' | 'suggest' | 'coach' | 'wrapped' | 'duplicate' | 'nudge' | 'onboarding' | 'capture'

/** Who an AI call is for — wrappers require one so no model call goes unlogged. */
export interface AiCaller {
  userId: string
  feature: AiFeature
}

export interface AiUsageDoc {
  at: Date
  user_id: string
  feature: AiFeature
  model: string
  inputTokens: number
  outputTokens: number
  thinkingTokens: number
  costUsd: number | null
  durationMs: number
  ok: boolean
  error: string | null
}

/** Records one AI call for /admin/ai. Never throws — logging must not fail the feature. */
export async function logAiUsage(
  caller: AiCaller,
  model: string,
  startedAt: number,
  usage: GenerateContentResponseUsageMetadata | undefined,
  error: unknown,
): Promise<void> {
  const tokens = {
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
    thinkingTokens: usage?.thoughtsTokenCount ?? 0,
  }
  try {
    const db = await getDb()
    await db.collection<AiUsageDoc>(AI_USAGE).insertOne({
      at: new Date(),
      user_id: caller.userId,
      feature: caller.feature,
      model,
      ...tokens,
      costUsd: estimateCostUsd(model, tokens),
      durationMs: Date.now() - startedAt,
      ok: !error,
      error: error ? String((error as Error).message ?? error).slice(0, 300) : null,
    })
  } catch (err) {
    console.warn('[aiUsage] could not record call:', (err as Error).message)
  }
}
