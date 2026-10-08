import { describe, it, expect, vi, beforeEach } from 'vitest'

const settings = { aiMonthlyCostUsd: null as number | null }
const aggregateMock = vi.fn()
const pipelineMock = vi.fn()
vi.mock('../systemSettings', () => ({ getSystemSettings: async () => settings }))
vi.mock('../mongodb', () => ({
  getDb: async () => ({
    collection: () => ({
      aggregate: (pipeline: unknown) => {
        pipelineMock(pipeline)
        return { toArray: aggregateMock }
      },
    }),
  }),
}))

const NOW = new Date('2026-10-15T12:00:00Z')
const user = { userId: 'user_a', readOnly: false, sessionId: null }

beforeEach(() => {
  vi.resetModules()
  aggregateMock.mockReset()
  settings.aiMonthlyCostUsd = null
})

describe('aiAllowanceResponse', () => {
  it('enforces nothing until a cap is set, and never reads usage', async () => {
    const { aiAllowanceResponse } = await import('./allowance')
    expect(await aiAllowanceResponse(user, NOW)).toBeNull()
    expect(aggregateMock).not.toHaveBeenCalled()
  })

  it('lets a user under the cap through', async () => {
    settings.aiMonthlyCostUsd = 0.1
    aggregateMock.mockResolvedValue([{ total: 0.09 }])
    const { aiAllowanceResponse } = await import('./allowance')
    expect(await aiAllowanceResponse(user, NOW)).toBeNull()
  })

  it('answers 429 with a stable code once the cap is reached', async () => {
    settings.aiMonthlyCostUsd = 0.1
    aggregateMock.mockResolvedValue([{ total: 0.1 }])
    const { aiAllowanceResponse, AI_ALLOWANCE_EXCEEDED } = await import('./allowance')
    const res = await aiAllowanceResponse(user, NOW)
    expect(res?.status).toBe(429)
    expect((await res!.json()).code).toBe(AI_ALLOWANCE_EXCEEDED)
  })

  it('treats a user with no usage yet as under the cap', async () => {
    settings.aiMonthlyCostUsd = 0.1
    aggregateMock.mockResolvedValue([])
    const { aiAllowanceResponse } = await import('./allowance')
    expect(await aiAllowanceResponse(user, NOW)).toBeNull()
  })

  it('leaves logging spends out of the spend it counts', async () => {
    settings.aiMonthlyCostUsd = 0.1
    aggregateMock.mockResolvedValue([{ total: 0.01 }])
    const { aiAllowanceResponse } = await import('./allowance')
    await aiAllowanceResponse(user, NOW)
    const [pipeline] = pipelineMock.mock.calls.at(-1) as [Array<{ $match?: { feature?: unknown } }>]
    expect(pipeline[0].$match?.feature).toEqual({ $nin: ['capture', 'nudge'] })
  })

  it('never applies to the shared demo user', async () => {
    settings.aiMonthlyCostUsd = 0.0001
    const { aiAllowanceResponse } = await import('./allowance')
    expect(await aiAllowanceResponse({ ...user, readOnly: true }, NOW)).toBeNull()
  })

  it('reads a cached spend for a minute, then re-reads', async () => {
    settings.aiMonthlyCostUsd = 0.1
    aggregateMock.mockResolvedValue([{ total: 0.01 }])
    const { aiAllowanceResponse } = await import('./allowance')
    await aiAllowanceResponse(user, NOW)
    await aiAllowanceResponse(user, new Date(NOW.getTime() + 30_000))
    expect(aggregateMock).toHaveBeenCalledTimes(1)
    await aiAllowanceResponse(user, new Date(NOW.getTime() + 61_000))
    expect(aggregateMock).toHaveBeenCalledTimes(2)
  })
})

describe('monthStart', () => {
  it('is the first instant of the UTC month', async () => {
    const { monthStart } = await import('./allowance')
    expect(monthStart(new Date('2026-10-31T23:59:59Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })
})
