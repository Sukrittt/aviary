import { describe, it, expect, vi, beforeEach } from 'vitest'

const findOneMock = vi.fn()
const getDbMock = vi.fn(async () => ({ collection: () => ({ findOne: findOneMock, updateOne: vi.fn() }) }))
vi.mock('./mongodb', () => ({ getDb: () => getDbMock() }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('system settings', () => {
  it('fails open to defaults when the DB is unreachable', async () => {
    getDbMock.mockRejectedValueOnce(new Error('down'))
    const { aiDisabledResponse, getSystemSettings } = await import('./systemSettings')
    expect(await getSystemSettings()).toEqual({
      aiDisabled: false,
      aiMonthlyCostUsd: null,
      maintenance: { on: false, message: '' },
      appUpdate: {
        android: {
          latestVersion: '',
          minVersion: '',
          storeUrl: 'https://play.google.com/store/apps/details?id=com.sukrit04.envelope',
        },
      },
      // Fails open in the safe direction: an unreachable settings doc must
      // never start locking paying users out of their own budgets.
      billing: { enforced: false, purchaseEnabled: false, audience: 'testers', retentionDeleteEnabled: false },
    })
    getDbMock.mockRejectedValueOnce(new Error('down'))
    expect(await aiDisabledResponse()).toBeNull()
  })

  it('answers 503 when AI is disabled, and caches the read', async () => {
    findOneMock.mockResolvedValue({ _id: 'global', aiDisabled: true })
    const { aiDisabledResponse } = await import('./systemSettings')
    expect((await aiDisabledResponse())?.status).toBe(503)
    await aiDisabledResponse()
    expect(findOneMock).toHaveBeenCalledTimes(1)
  })

  /**
   * The production `system_settings` document predates billing and has no
   * `billing` key at all. Deploying the backend ahead of the app depends
   * entirely on that absence reading as "off" — if it ever read as "on",
   * every user of the released app is locked out of their own budgets the
   * moment the deploy goes live, with no app update available to fix it.
   */
  it('reads a settings document with no billing key as subscriptions-off', async () => {
    findOneMock.mockResolvedValue({ _id: 'global', aiDisabled: false, maintenance: { on: false, message: '' } })
    const { getSystemSettings } = await import('./systemSettings')
    expect((await getSystemSettings()).billing).toEqual({ enforced: false, purchaseEnabled: false, audience: 'testers', retentionDeleteEnabled: false })
  })

  it('backfills update defaults for an older settings document', async () => {
    findOneMock.mockResolvedValue({ _id: 'global', aiDisabled: false, maintenance: { on: true, message: 'Soon' } })
    const { getSystemSettings } = await import('./systemSettings')
    const settings = await getSystemSettings()
    expect(settings.appUpdate.android.latestVersion).toBe('')
    expect(settings.appUpdate.android.storeUrl).toContain('com.sukrit04.envelope')
  })
})
