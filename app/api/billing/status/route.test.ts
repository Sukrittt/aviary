import { describe, it, expect, vi } from 'vitest'

const who = vi.hoisted(() => ({ auth: {} as Record<string, unknown> }))
vi.mock('@/lib/access', () => ({ getAuth: async () => who.auth }))
vi.mock('@/lib/billing/service', () => ({ getAccess: async () => ({ allowed: false, mode: 'setup_incomplete' }) }))
const users = vi.hoisted(() => ({ doc: null as null | { noPersonalBudget?: boolean } }))
vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ collection: () => ({ findOne: async () => users.doc }) }) }))
vi.mock('@/lib/billing/flags', () => ({ billingFlagsFor: async () => ({ enforced: true, purchaseEnabled: true }) }))

import { GET } from './route'

describe('GET /api/billing/status', () => {
  it("says a budget someone else pays for is covered, so a member with no plan of their own isn't locked out", async () => {
    who.auth = { userId: 'user_b', readOnly: false, spaceId: 'sp_home', spaceOwnerId: 'user_a' }
    expect(await (await GET(new Request('http://x'))).json()).toMatchObject({ allowed: false, covered: true })
  })

  it('leaves their own budget to their own plan', async () => {
    who.auth = { userId: 'user_b', readOnly: false, spaceId: 'user_b', spaceOwnerId: 'user_b' }
    users.doc = {}
    expect(await (await GET(new Request('http://x'))).json()).toMatchObject({ allowed: false, covered: false })
  })

  it('covers someone who only joined, even on a request that names no budget', async () => {
    // A new browser (or after logging out) has no budget cookie yet. They have
    // no personal budget, so nothing they can open is on their own plan; saying
    // otherwise bounced them between /expense and /onboarding forever.
    who.auth = { userId: 'user_b', readOnly: false, spaceId: 'user_b', spaceOwnerId: 'user_b' }
    users.doc = { noPersonalBudget: true }
    expect(await (await GET(new Request('http://x'))).json()).toMatchObject({ allowed: false, covered: true })
  })
})
