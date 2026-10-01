import { describe, it, expect, vi, beforeEach } from 'vitest'

const runJev = vi.fn()
vi.mock('./jev', () => ({ runJev: (...args: unknown[]) => runJev(...(args as [])) }))

const { routeChat, ALWAYS_SECTIONS } = await import('./chatRouter')
const caller = { userId: 'user_1', feature: 'chat' as const }

function answers(probabilities: Record<string, number>) {
  return Object.fromEntries(Object.entries(probabilities).map(([k, probability]) => [k, { type: 'boolean', probability }]))
}

const onTopicOnly = { onTopic: 0.98, needsTransactions: 0.02, needsTrend: 0.05, needsSubscriptions: 0.01, needsInvestments: 0.01, isDecision: 0.03 }

beforeEach(() => vi.clearAllMocks())

describe('routeChat', () => {
  it('sends only the user message to Jev', async () => {
    runJev.mockResolvedValue(answers(onTopicOnly))
    await routeChat('how much on food?', caller)
    expect(runJev.mock.calls[0][0]).toEqual({ message: 'how much on food?' })
  })

  it('gives Jev the earlier user turns so a follow-up keeps its context', async () => {
    runJev.mockResolvedValue(answers(onTopicOnly))
    await routeChat("It's 12k.", caller, ['Can I afford a Kindle?'])
    expect(runJev.mock.calls[0][0]).toEqual({ message: "It's 12k.", earlierMessages: ['Can I afford a Kindle?'] })
    expect(runJev.mock.calls[0][1].isDecision.instructions).toContain('earlierMessages')
  })

  it('always keeps the cheap sections, whatever Jev says', async () => {
    runJev.mockResolvedValue(answers(onTopicOnly))
    const route = await routeChat('how much on food?', caller)
    expect(route.onTopic).toBe(true)
    expect(route.sections).toEqual([...ALWAYS_SECTIONS])
  })

  it('adds the transaction rows only when the question needs them', async () => {
    runJev.mockResolvedValue(answers({ ...onTopicOnly, needsTransactions: 0.9 }))
    const route = await routeChat('what did I buy on the 4th?', caller)
    expect(route.sections).toContain('transactions')
  })

  it('adds trend, subscriptions and investments on their own signals', async () => {
    runJev.mockResolvedValue(answers({ ...onTopicOnly, needsTrend: 0.8, needsSubscriptions: 0.7, needsInvestments: 0.6 }))
    const route = await routeChat('how do my subs and holdings compare to last month?', caller)
    expect(route.sections).toEqual(expect.arrayContaining(['trend', 'subscriptions', 'investments']))
  })

  it('sends every section and flags a decision for affordability questions', async () => {
    runJev.mockResolvedValue(answers({ ...onTopicOnly, isDecision: 0.9 }))
    const route = await routeChat('can I afford a 7K subscription?', caller)
    expect(route.decision).toBe(true)
    expect(route.sections).toEqual(expect.arrayContaining(['transactions', 'trend', 'subscriptions', 'investments']))
  })

  it('does not flag a plain lookup as a decision', async () => {
    runJev.mockResolvedValue(answers(onTopicOnly))
    expect((await routeChat('how much on food?', caller)).decision).toBe(false)
  })

  it('refuses only when Jev is confident the message is off topic', async () => {
    // Measured Jev probabilities: "write me a poem" 0.01, "what is 1+1" 0.02.
    runJev.mockResolvedValue(answers({ ...onTopicOnly, onTopic: 0.02 }))
    expect((await routeChat('write me a poem', caller)).onTopic).toBe(false)

    runJev.mockResolvedValue(answers({ ...onTopicOnly, onTopic: 0.35 }))
    expect((await routeChat('is this normal?', caller)).onTopic).toBe(true)
  })

  it.each([
    ['how am I doing?', 0.16],
    ['Am i doing okay?', 0.18],
    ['what should I do?', 0.18],
    ['should I be worried?', 0.31],
    ['is this normal?', 0.48],
  ])('answers the vague but financial %s (measured p=%s)', async (message, probability) => {
    runJev.mockResolvedValue(answers({ ...onTopicOnly, onTopic: probability }))
    expect((await routeChat(message, caller)).onTopic).toBe(true)
  })

  it('sends everything when Jev fails, matching the old behaviour', async () => {
    runJev.mockRejectedValue(new Error('gateway down'))
    const route = await routeChat('how much on food?', caller)
    expect(route.onTopic).toBe(true)
    expect(route.sections).toEqual(expect.arrayContaining(['transactions', 'trend', 'subscriptions', 'investments']))
  })

  it('sends everything when an answer comes back in the wrong shape', async () => {
    runJev.mockResolvedValue({ onTopic: { type: 'choice', choice: 'yes' } })
    const route = await routeChat('how much on food?', caller)
    expect(route.sections).toEqual(expect.arrayContaining(['transactions']))
  })
})
