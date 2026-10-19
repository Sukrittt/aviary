import { describe, it, expect, vi } from 'vitest'

const who = vi.hoisted(() => ({ auth: {} as Record<string, unknown> }))
vi.mock('@/lib/access', () => ({ getAuth: async () => who.auth }))
vi.mock('@/lib/billing/service', () => ({ getAccess: async () => ({ allowed: false, mode: 'setup_incomplete' }) }))
vi.mock('@/lib/billing/flags', () => ({ billingFlagsFor: async () => ({ enforced: true, purchaseEnabled: true }) }))

import { GET } from './route'

describe('GET /api/billing/status', () => {
  it("says a budget someone else pays for is covered, so a member with no plan of their own isn't locked out", async () => {
    who.auth = { userId: 'user_b', readOnly: false, spaceId: 'sp_home', spaceOwnerId: 'user_a' }
    expect(await (await GET(new Request('http://x'))).json()).toMatchObject({ allowed: false, covered: true })
  })

  it('leaves their own budget to their own plan', async () => {
    who.auth = { userId: 'user_b', readOnly: false, spaceId: 'user_b', spaceOwnerId: 'user_b' }
    expect(await (await GET(new Request('http://x'))).json()).toMatchObject({ allowed: false, covered: false })
  })
})
