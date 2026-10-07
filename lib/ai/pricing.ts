export interface TokenCounts {
  inputTokens: number
  outputTokens: number
  /** Billed at the output rate. */
  thinkingTokens: number
}

/**
 * USD per 1M tokens, standard (paid tier) text/image rates from
 * https://ai.google.dev/gemini-api/docs/pricing, checked 2026-09-17.
 * Ignores the audio rate and implicit-cache discounts, so estimates run slightly high.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  // Kept for historical ai_usage rows written before Ask Aviary moved off it.
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  // The hedge backup (lib/ai/gemini.ts). https://ai.google.dev/gemini-api/docs/pricing, checked 2026-10-08.
  'gemini-3.5-flash': { input: 1.5, output: 9 },
  // https://vercel.com/ai-gateway/models/jev, checked 2026-09-19: input only, no output charge.
  'typesafe-ai/jev': { input: 0.042, output: 0 },
}

/** Estimated USD cost of one call, or null when the model has no price entry. */
export function estimateCostUsd(model: string, tokens: TokenCounts): number | null {
  const price = PRICES[model]
  if (!price) return null
  return (tokens.inputTokens * price.input + (tokens.outputTokens + tokens.thinkingTokens) * price.output) / 1_000_000
}
