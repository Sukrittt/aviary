import { describe, it, expect } from 'vitest'
import { estimateCostUsd } from './pricing'

describe('estimateCostUsd', () => {
  it('prices input, output and thinking tokens for flash-lite', () => {
    // 1M input × $0.25 + (500k output + 500k thinking) × $1.50
    expect(estimateCostUsd('gemini-3.1-flash-lite', { inputTokens: 1_000_000, outputTokens: 500_000, thinkingTokens: 500_000 })).toBeCloseTo(1.75, 10)
  })

  it('prices the Ask Aviary model at its published rates', () => {
    // 1M input × $0.30 + (500k output + 500k thinking) × $2.50
    expect(estimateCostUsd('gemini-3.5-flash-lite', { inputTokens: 1_000_000, outputTokens: 500_000, thinkingTokens: 500_000 })).toBeCloseTo(2.8, 10)
  })

  it('prices Jev on input tokens only', () => {
    expect(estimateCostUsd('typesafe-ai/jev', { inputTokens: 1_000_000, outputTokens: 75, thinkingTokens: 0 })).toBeCloseTo(0.042, 10)
  })

  it('is zero for no tokens', () => {
    expect(estimateCostUsd('gemini-3.1-flash-lite', { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 })).toBe(0)
  })

  it('returns null for a model without a price entry', () => {
    expect(estimateCostUsd('some-new-model', { inputTokens: 10, outputTokens: 10, thinkingTokens: 0 })).toBeNull()
  })
})
