import { describe, it, expect, vi, beforeEach } from 'vitest'

const logMock = vi.fn(async () => undefined)
const evaluate = vi.fn()
const getSystemSettings = vi.fn(async () => ({ aiDisabled: false }))

vi.mock('./usage', () => ({ logAiUsage: (...args: unknown[]) => logMock(...(args as [])) }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => fn() }))
vi.mock('ai', () => ({ experimental_evaluate: (...args: unknown[]) => evaluate(...args) }))
vi.mock('../systemSettings', () => ({
  AI_DISABLED_MESSAGE: 'AI is off',
  getSystemSettings: () => getSystemSettings(),
}))

const { triageFeedback } = await import('./feedbackTriage')
const caller = { userId: 'user_1', feature: 'feedback' as const }
const usage = { inputTokens: 42, outputTokens: 2, totalTokens: 44 }

function answer(area: string, severity: number) {
  return {
    answers: {
      area: { type: 'choice', choice: area, probabilities: { [area]: 0.95 } },
      severity: { type: 'score', score: severity },
    },
    usage,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getSystemSettings.mockResolvedValue({ aiDisabled: false })
})

describe('triageFeedback', () => {
  it('sends only title and description and asks the requested choice and score questions', async () => {
    evaluate.mockResolvedValue(answer('budget', 2))

    await triageFeedback('Balance is wrong', 'Moving money did not update it.', caller)

    const request = evaluate.mock.calls[0][0]
    expect(request.model).toBe('typesafe-ai/jev')
    expect(request.state).toEqual({ title: 'Balance is wrong', description: 'Moving money did not update it.' })
    expect(Object.keys(request.state)).toEqual(['title', 'description'])
    expect(request.questions.area.type).toBe('choice')
    expect(Object.keys(request.questions.area.criteria)).toEqual(['budget', 'transactions', 'sync', 'billing', 'ai', 'other'])
    expect(request.questions.severity.type).toBe('score')
    expect(request.questions.severity.criteria).toHaveLength(4)
    expect(request.providerOptions).toEqual({ gateway: { disallowPromptTraining: true } })
    expect(request.maxRetries).toBe(0)
    expect(request.abortSignal).toBeInstanceOf(AbortSignal)
  })

  it('returns valid labels and logs usage', async () => {
    evaluate.mockResolvedValue(answer('transactions', 3))

    await expect(triageFeedback('Expense disappeared', 'The saved row is gone.', caller)).resolves.toEqual({
      area: 'transactions',
      severity: 3,
    })
    expect(logMock).toHaveBeenCalledWith(caller, 'typesafe-ai/jev', expect.any(Number), {
      promptTokenCount: 42,
      candidatesTokenCount: 2,
    }, null, expect.any(Number))
  })

  it.each([
    ['unknown', 1],
    ['budget', -1],
    ['budget', 4],
  ])('rejects an invalid result (%s, %s)', async (area, severity) => {
    evaluate.mockResolvedValue(answer(area, severity))

    await expect(triageFeedback('Title', 'Description', caller)).rejects.toThrow('invalid feedback triage')
    // The call itself succeeded, so `runJev` records it as ok; only the payload was unusable.
    expect(logMock).toHaveBeenLastCalledWith(caller, 'typesafe-ai/jev', expect.any(Number), {
      promptTokenCount: 42,
      candidatesTokenCount: 2,
    }, null, expect.any(Number))
  })

  it.each([
    [1.11, 1],
    [1.5, 2],
    [2.49, 2],
    [3.4, 3],
  ])('rounds the score question\'s weighted-average severity (%s -> %s)', async (rawScore, rounded) => {
    evaluate.mockResolvedValue(answer('budget', rawScore))

    await expect(triageFeedback('Title', 'Description', caller)).resolves.toEqual({ area: 'budget', severity: rounded })
  })

  it('does not call Jev when the AI kill switch is on', async () => {
    getSystemSettings.mockResolvedValue({ aiDisabled: true })

    await expect(triageFeedback('Title', 'Description', caller)).rejects.toThrow('AI is off')
    expect(evaluate).not.toHaveBeenCalled()
  })
})
