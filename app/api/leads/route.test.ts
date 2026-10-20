import { beforeEach, describe, expect, it, vi } from 'vitest'

const isRateLimited = vi.fn(async (_key: string) => false)
vi.mock('@/lib/rateLimit', () => ({ isRateLimited, clientIp: () => '1.2.3.4' }))
vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({}) }))
const queueLeadPlan = vi.fn(async () => 'lead/x/plan/2026-10-19')
const scheduleOutboxSend = vi.fn()
vi.mock('@/lib/email/lifecycle', () => ({ queueLeadPlan, scheduleOutboxSend }))
const { POST } = await import('./route')

const post = (body: unknown) => POST(new Request('https://useaviary.com/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

beforeEach(() => { vi.clearAllMocks(); isRateLimited.mockResolvedValue(false) })

describe('POST /api/leads', () => {
  it('rebuilds the plan from salary and rent, then sends it', async () => {
    const res = await post({ email: ' Me@Example.com ', salary: 50000, rent: 12000 })
    expect(await res.json()).toEqual({ ok: true })
    const [, email, plan] = queueLeadPlan.mock.calls[0] as unknown as [unknown, string, { salary: number; rows: [string, number][] }]
    expect(email).toBe('me@example.com')
    expect(plan.salary).toBe(50000)
    expect(plan.rows).toContainEqual(['Rent', 12000])
    expect(plan.rows.reduce((n, [, amount]) => n + amount, 0)).toBe(50000)
    expect(scheduleOutboxSend).toHaveBeenCalledWith('lead/x/plan/2026-10-19')
  })

  it.each([
    [{ email: 'nope', salary: 50000 }],
    [{ email: 'a@b.co', salary: 0 }],
    [{ email: 'a@b.co', salary: 50000, rent: -1 }],
    [{ email: 'a@b.co', salary: 1e12 }],
  ])('rejects bad input %j', async body => {
    expect((await post(body)).status).toBe(400)
    expect(queueLeadPlan).not.toHaveBeenCalled()
  })

  it('accepts anything the planner field can hold', async () => {
    expect((await post({ email: 'a@b.co', salary: 9_999_999_999, rent: 2_00_00_000 })).status).toBe(200)
  })

  it('stops queueing plans once the day’s global cap is hit (#206)', async () => {
    isRateLimited.mockImplementation(async (key: string) => key === 'leads:global')
    expect((await post({ email: 'a@b.co', salary: 50000 })).status).toBe(429)
    expect(queueLeadPlan).not.toHaveBeenCalled()
  })

  it('rate limits by IP', async () => {
    isRateLimited.mockResolvedValue(true)
    expect((await post({ email: 'a@b.co', salary: 50000 })).status).toBe(429)
  })
})
