import { describe, it, expect, vi, beforeEach } from 'vitest'

const logMock = vi.fn(async () => undefined)
const evaluate = vi.fn()

vi.mock('./usage', () => ({ logAiUsage: (...args: unknown[]) => logMock(...(args as [])) }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => fn() }))
vi.mock('ai', () => ({ experimental_evaluate: (...args: unknown[]) => evaluate(...args) }))
vi.mock('../systemSettings', () => ({
  AI_DISABLED_MESSAGE: 'AI is off',
  getSystemSettings: async () => ({ aiDisabled: false }),
}))

const { pickCategory, pickHoldingType, pickBudgetBuckets, scoreCategory } = await import('./jev')
const caller = { userId: 'user_1', feature: 'suggest' as const }
const usage = { inputTokens: 40, outputTokens: 1, totalTokens: 41 }

function answer(choice: string, probabilities?: Record<string, number>) {
  return { answers: { category: { type: 'choice', choice, probabilities } }, usage }
}

function typeAnswer(choice: string, probabilities?: Record<string, number>) {
  return { answers: { holdingType: { type: 'choice', choice, probabilities } }, usage }
}

beforeEach(() => vi.clearAllMocks())

describe('pickCategory', () => {
  it('asks a choice question over exactly the given categories', async () => {
    evaluate.mockResolvedValue(answer('Food', { Food: 0.9, Travel: 0.1 }))
    await pickCategory('swiggy dinner', ['Food', 'Travel'], caller)
    const { model, questions } = evaluate.mock.calls[0][0]
    expect(model).toBe('typesafe-ai/jev')
    expect(questions.category.type).toBe('choice')
    expect(Object.keys(questions.category.criteria)).toEqual(['Food', 'Travel'])
    // Zero Data Retention needs Vercel Pro; the gateway 403s every call on Hobby.
    expect(evaluate.mock.calls[0][0].providerOptions).toEqual({ gateway: { disallowPromptTraining: true } })
  })

  it('returns the choice when it is confident', async () => {
    evaluate.mockResolvedValue(answer('Food', { Food: 0.9, Travel: 0.1 }))
    expect(await pickCategory('swiggy dinner', ['Food', 'Travel'], caller)).toBe('Food')
  })

  it('returns empty when no option clears the confidence bar', async () => {
    // Real Jev answer for the gibberish item "zxqv 42": Shopping at 0.62.
    evaluate.mockResolvedValue(answer('Shopping', { Shopping: 0.62, Food: 0.2, Travel: 0.18 }))
    expect(await pickCategory('zxqv 42', ['Shopping', 'Food', 'Travel'], caller)).toBe('')
  })

  it('trusts the choice when no distribution comes back', async () => {
    evaluate.mockResolvedValue(answer('Travel'))
    expect(await pickCategory('uber', ['Food', 'Travel'], caller)).toBe('Travel')
  })

  it('never returns a category outside the list', async () => {
    evaluate.mockResolvedValue(answer('Groceries', { Groceries: 1 }))
    expect(await pickCategory('milk', ['Food', 'Travel'], caller)).toBe('')
  })

  it('logs usage on success and on failure', async () => {
    evaluate.mockResolvedValue(answer('Food', { Food: 1 }))
    await pickCategory('pizza', ['Food'], caller)
    expect(logMock).toHaveBeenCalledWith(caller, 'typesafe-ai/jev', expect.any(Number), { promptTokenCount: 40, candidatesTokenCount: 1 }, null)

    evaluate.mockRejectedValue(new Error('gateway down'))
    await expect(pickCategory('pizza', ['Food'], caller)).rejects.toThrow('gateway down')
    expect(logMock).toHaveBeenLastCalledWith(caller, 'typesafe-ai/jev', expect.any(Number), undefined, expect.any(Error))
  })
})

describe('scoreCategory', () => {
  it('returns the confident pick with its probability', async () => {
    evaluate.mockResolvedValue(answer('Food', { Food: 0.93, Travel: 0.07 }))
    expect(await scoreCategory('swiggy dinner', ['Food', 'Travel'], caller)).toEqual({ choice: 'Food', probability: 0.93 })
  })

  it('keeps the probability but drops the pick below the bar', async () => {
    evaluate.mockResolvedValue(answer('Shopping', { Shopping: 0.62, Food: 0.38 }))
    expect(await scoreCategory('zxqv 42', ['Shopping', 'Food'], caller)).toEqual({ choice: '', probability: 0.62 })
  })

  it('reports no probability when no distribution comes back', async () => {
    evaluate.mockResolvedValue(answer('Travel'))
    expect(await scoreCategory('uber', ['Food', 'Travel'], caller)).toEqual({ choice: 'Travel', probability: null })
  })

  it('never returns a category outside the list', async () => {
    evaluate.mockResolvedValue(answer('Groceries', { Groceries: 1 }))
    expect(await scoreCategory('milk', ['Food', 'Travel'], caller)).toEqual({ choice: '', probability: null })
  })
})

describe('pickHoldingType', () => {
  it('asks a choice question over exactly the given types', async () => {
    evaluate.mockResolvedValue(typeAnswer('Equity', { Equity: 0.9, FD: 0.1 }))
    await pickHoldingType('Nifty Index Fund', ['Equity', 'FD'], caller)
    const { model, questions } = evaluate.mock.calls[0][0]
    expect(model).toBe('typesafe-ai/jev')
    expect(questions.holdingType.type).toBe('choice')
    expect(Object.keys(questions.holdingType.criteria)).toEqual(['Equity', 'FD'])
  })

  it('returns the choice when it is confident', async () => {
    evaluate.mockResolvedValue(typeAnswer('Gold', { Gold: 0.95, Other: 0.05 }))
    expect(await pickHoldingType('Sovereign Gold Bond', ['Gold', 'Other'], caller)).toBe('Gold')
  })

  it('returns empty when no option clears the confidence bar', async () => {
    evaluate.mockResolvedValue(typeAnswer('Other', { Other: 0.6, Equity: 0.4 }))
    expect(await pickHoldingType('xyz', ['Other', 'Equity'], caller)).toBe('')
  })

  it('never returns a type outside the list', async () => {
    evaluate.mockResolvedValue(typeAnswer('Crypto', { Crypto: 1 }))
    expect(await pickHoldingType('Stocks', ['Equity', 'FD'], caller)).toBe('')
  })
})

describe('pickBudgetBuckets', () => {
  const onboarding = { userId: 'user_1', feature: 'onboarding' as const }
  const pick = (choice: string, p: number) => ({ type: 'choice', choice, probabilities: { [choice]: p } })

  it('asks every category in one call, with its group as context', async () => {
    evaluate.mockResolvedValue({ answers: { c0: pick('savings', 0.95), c1: pick('need', 0.9) }, usage })
    await pickBudgetBuckets([{ name: 'SIP', group: 'Future' }, { name: 'Gym', group: 'Health' }], onboarding)
    expect(evaluate).toHaveBeenCalledTimes(1)
    const { state, questions } = evaluate.mock.calls[0][0]
    expect(state).toEqual({ category_0: 'SIP', group_0: 'Future', category_1: 'Gym', group_1: 'Health' })
    expect(Object.keys(questions)).toEqual(['c0', 'c1'])
    expect(Object.keys(questions.c0.criteria)).toEqual(['need', 'want', 'savings'])
  })

  it('returns confident tags keyed by lowercased name and drops the unsure ones', async () => {
    evaluate.mockResolvedValue({ answers: { c0: pick('savings', 0.95), c1: pick('want', 0.5) }, usage })
    const tags = await pickBudgetBuckets([{ name: 'SIP', group: 'Future' }, { name: 'zxqv', group: 'x' }], onboarding)
    expect(tags).toEqual({ sip: 'savings' })
  })

  it('never returns a bucket outside need, want and savings', async () => {
    evaluate.mockResolvedValue({ answers: { c0: pick('luxury', 1) }, usage })
    expect(await pickBudgetBuckets([{ name: 'Yacht', group: 'Fun' }], onboarding)).toEqual({})
  })

  it('skips the model call when there is nothing to tag', async () => {
    expect(await pickBudgetBuckets([], onboarding)).toEqual({})
    expect(evaluate).not.toHaveBeenCalled()
  })
})
