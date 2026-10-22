import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const })),
}))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: vi.fn(async () => null) }))
const computeCarry = vi.fn(async (_auth: unknown, month: string) => ({ month, ready_to_assign: 5000, rolled_over: { Travel: 95 } }))
vi.mock('@/lib/budgetCarry', () => ({ computeCarry: (auth: unknown, month: string) => computeCarry(auth, month) }))

import { GET } from './route'

describe('GET /api/budgets/carry', () => {
  it('returns the carry for the month', async () => {
    const res = await GET(new Request('http://x/api/budgets/carry?month=2026-11'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ month: '2026-11', ready_to_assign: 5000, rolled_over: { Travel: 95 } })
  })

  it('rejects a missing or malformed month', async () => {
    expect((await GET(new Request('http://x/api/budgets/carry'))).status).toBe(400)
    expect((await GET(new Request('http://x/api/budgets/carry?month=2026-13'))).status).toBe(400)
  })
})
