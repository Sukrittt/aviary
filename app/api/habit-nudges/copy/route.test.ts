import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ write: vi.fn(), ai: vi.fn(), rate: vi.fn(), guard: vi.fn() }))
vi.mock('@/lib/access', () => ({ getAuth: async () => ({ userId: 'user_a', readOnly: false }), readOnlyGuard: mocks.guard }))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: async () => null }))
vi.mock('@/lib/systemSettings', () => ({ aiDisabledResponse: mocks.ai }))
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: mocks.rate }))
vi.mock('@/lib/ai/nudgeCopy', () => ({ writeNudgeCopy: mocks.write }))

import { POST } from './route'

const post = (body: unknown) => POST(new Request('http://x/api/habit-nudges/copy', { method: 'POST', body: JSON.stringify(body) }))
const habit = { item: 'Football', category: 'Fun', weekdays: [1, 3, 5], minute: 1140 }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.ai.mockResolvedValue(null)
  mocks.rate.mockResolvedValue(false)
  mocks.guard.mockReturnValue(null)
})

describe('POST /api/habit-nudges/copy', () => {
  it('returns the written copy', async () => {
    mocks.write.mockResolvedValue({ title: 'Football night?', bodies: ['Log it while it’s fresh.'] })
    const res = await post(habit)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ title: 'Football night?', bodies: ['Log it while it’s fresh.'] })
    expect(mocks.write).toHaveBeenCalledWith(habit, 'user_a')
  })

  it('rejects a malformed habit before calling the model', async () => {
    for (const bad of [{ ...habit, item: '' }, { ...habit, weekdays: [7] }, { ...habit, minute: 1440 }, { ...habit, weekdays: [] }]) {
      expect((await post(bad)).status).toBe(400)
    }
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('answers 429 when rate limited and 502 when the model gives nothing usable', async () => {
    mocks.rate.mockResolvedValueOnce(true)
    expect((await post(habit)).status).toBe(429)
    mocks.write.mockResolvedValueOnce(null)
    expect((await post(habit)).status).toBe(502)
  })
})
