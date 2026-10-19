import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Auth } from '../access'

const getSystemSettingsMock = vi.fn(async () => ({ billing: { enforced: true, purchaseEnabled: true, audience: 'everyone' } }))
vi.mock('../systemSettings', () => ({ getSystemSettings: getSystemSettingsMock }))

const getAccessMock = vi.fn()
vi.mock('./service', () => ({ getAccess: getAccessMock }))

const { requireAccess, SUBSCRIPTION_REQUIRED, NOT_A_MEMBER } = await import('./guard')

const user: Auth = { userId: 'user_a', readOnly: false, sessionId: 'sess_1', spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const }
const demo: Auth = { userId: 'demo', readOnly: true, sessionId: null, spaceId: 'demo', spaceOwnerId: 'demo', spaceRole: 'owner' as const }

beforeEach(() => {
  vi.clearAllMocks()
  getSystemSettingsMock.mockResolvedValue({ billing: { enforced: true, purchaseEnabled: true, audience: 'everyone' } })
})

describe('requireAccess', () => {
  it('blocks an expired account with 402 and a stable code', async () => {
    getAccessMock.mockResolvedValue({ allowed: false, mode: 'expired', trialEndsAt: '2026-01-01T00:00:00.000Z' })
    const res = await requireAccess(user)
    expect(res?.status).toBe(402)
    // Not 401: the session is fine, the subscription is not. A client that
    // treated this as an auth failure would sign the user out instead of
    // offering to sell them a subscription.
    expect(await res!.json()).toMatchObject({ error: SUBSCRIPTION_REQUIRED, mode: 'expired' })
  })

  it('lets an allowed account through', async () => {
    getAccessMock.mockResolvedValue({ allowed: true, mode: 'trial', trialEndsAt: null })
    expect(await requireAccess(user)).toBeNull()
  })

  it('lets a new user write their setup before the trial exists', async () => {
    // The trial starts at onboarding completion, which requires setup rows.
    // Blocking setup_incomplete would deadlock every new signup.
    getAccessMock.mockResolvedValue({ allowed: false, mode: 'setup_incomplete', trialEndsAt: null })
    expect(await requireAccess(user, { setup: true })).toBeNull()
  })

  it('keeps every other route closed until onboarding starts the trial', async () => {
    getAccessMock.mockResolvedValue({ allowed: false, mode: 'setup_incomplete', trialEndsAt: null })
    expect((await requireAccess(user))?.status).toBe(402)
  })

  it('does not let an expired account in through a setup route', async () => {
    getAccessMock.mockResolvedValue({ allowed: false, mode: 'expired', trialEndsAt: '2026-01-01T00:00:00.000Z' })
    expect((await requireAccess(user, { setup: true }))?.status).toBe(402)
  })

  it('costs nothing while enforcement is off — no access lookup at all', async () => {
    getSystemSettingsMock.mockResolvedValue({ billing: { enforced: false, purchaseEnabled: false, audience: 'everyone' } })
    expect(await requireAccess(user)).toBeNull()
    // This guard sits on 51 handlers; a lookup per request while the feature
    // is dark would be a cost paid by every user for nothing.
    expect(getAccessMock).not.toHaveBeenCalled()
  })

  it('never blocks the read-only demo user', async () => {
    expect(await requireAccess(demo)).toBeNull()
    expect(getSystemSettingsMock).not.toHaveBeenCalled()
  })

  describe('in a shared budget', () => {
    const member: Auth = { userId: 'user_b', readOnly: false, sessionId: 's', spaceId: 'sp_home', spaceOwnerId: 'user_a', spaceRole: 'member' }

    it("checks the owner's plan, not the member's", async () => {
      getAccessMock.mockImplementation(async (id: string) => (id === 'user_a' ? { allowed: true, mode: 'paid' } : { allowed: false, mode: 'expired' }))
      expect(await requireAccess(member)).toBeNull()
      expect(getAccessMock).toHaveBeenCalledWith('user_a')
      expect(getAccessMock).not.toHaveBeenCalledWith('user_b')
    })

    it("blocks a member when the owner's plan has lapsed, even if their own is paid", async () => {
      getAccessMock.mockImplementation(async (id: string) => (id === 'user_a' ? { allowed: false, mode: 'expired' } : { allowed: true, mode: 'paid' }))
      expect((await requireAccess(member))?.status).toBe(402)
    })

    it('answers 403 to a non-member, even with billing switched off', async () => {
      getSystemSettingsMock.mockResolvedValue({ billing: { enforced: false, purchaseEnabled: false, audience: 'everyone' } })
      const res = await requireAccess({ ...member, spaceDenied: true })
      expect(res?.status).toBe(403)
      expect(await res!.json()).toMatchObject({ error: NOT_A_MEMBER })
    })
  })
})
