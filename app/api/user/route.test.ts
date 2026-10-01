import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null })),
}))

const softDeleteMock = vi.fn(async () => '2026-09-26T00:00:00+05:30')
vi.mock('@/lib/accountLifecycle', () => ({ softDeleteAccount: softDeleteMock }))

const deleteUserMock = vi.fn(async () => undefined)
const updateUserMock = vi.fn(async () => undefined)
vi.mock('@/lib/workosClient', () => ({
  getWorkOSClient: vi.fn(() => ({ userManagement: { deleteUser: deleteUserMock, updateUser: updateUserMock } })),
}))

const usersDeleteOneMock = vi.fn(async () => ({ deletedCount: 1 }))
const usersFindOneMock = vi.fn(async () => ({ email: 'real-owner@example.com' }))
const usersUpdateOneMock = vi.fn(async () => ({ modifiedCount: 1 }))

vi.mock('@/lib/mongodb', () => ({
  getDb: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: usersFindOneMock,
      deleteOne: usersDeleteOneMock,
      updateOne: usersUpdateOneMock,
    })),
  })),
}))

const completeOnboardingMock = vi.fn(async () => ({ ok: true, onboardedAt: '2026-09-18T12:00:00.000Z', account: {} }))
const cancelWebSubscriptionsMock = vi.fn(async (_userId: string) => 0)
vi.mock('@/lib/billing/service', () => ({ completeOnboarding: completeOnboardingMock, cancelWebSubscriptions: cancelWebSubscriptionsMock }))
const { BillingProviderError } = await import('@/lib/billing/providerError')

const { DELETE, PATCH } = await import('./route')

function patchRequest(body: unknown): Request {
  return new Request('https://example.com/api/user', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deleteRequest(body: unknown): Request {
  return new Request('https://example.com/api/user', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  usersFindOneMock.mockResolvedValue({ email: 'real-owner@example.com' })
  completeOnboardingMock.mockResolvedValue({ ok: true, onboardedAt: '2026-09-18T12:00:00.000Z', account: {} })
})

describe('DELETE /api/user', () => {
  it('rejects when no email is supplied', async () => {
    const res = await DELETE(deleteRequest({}))
    expect(res.status).toBe(400)
    expect(deleteUserMock).not.toHaveBeenCalled()
  })

  it('rejects when the supplied email does not match the account on file', async () => {
    const res = await DELETE(deleteRequest({ email: 'attacker@example.com' }))
    expect(res.status).toBe(400)
    expect(deleteUserMock).not.toHaveBeenCalled()
    expect(usersDeleteOneMock).not.toHaveBeenCalled()
  })

  it('proceeds when the supplied email matches, case-insensitively — soft-deletes, does not touch WorkOS yet', async () => {
    const res = await DELETE(deleteRequest({ email: 'Real-Owner@Example.com' }))
    expect(res.status).toBe(200)
    // Account deletion is soft too: the WorkOS user and the local `users` row
    // are removed by the GC cron once the grace window passes, not here.
    expect(deleteUserMock).not.toHaveBeenCalled()
    expect(usersDeleteOneMock).not.toHaveBeenCalled()
    expect(softDeleteMock).toHaveBeenCalledWith(expect.anything(), 'user_a')
  })

  it('cancels any web subscription before scheduling the deletion', async () => {
    const res = await DELETE(deleteRequest({ email: 'real-owner@example.com' }))
    expect(res.status).toBe(200)
    expect(cancelWebSubscriptionsMock).toHaveBeenCalledWith('user_a')
    expect(cancelWebSubscriptionsMock.mock.invocationCallOrder[0]).toBeLessThan(softDeleteMock.mock.invocationCallOrder[0])
  })

  it('refuses to delete when the web subscription could not be cancelled, so nobody is billed for a gone account', async () => {
    cancelWebSubscriptionsMock.mockRejectedValueOnce(new BillingProviderError('Razorpay responded 502', 502))
    const res = await DELETE(deleteRequest({ email: 'real-owner@example.com' }))
    expect(res.status).toBe(503)
    expect(softDeleteMock).not.toHaveBeenCalled()
  })

  it('no longer accepts the old confirm:true shortcut without an email', async () => {
    const res = await DELETE(deleteRequest({ confirm: true }))
    expect(res.status).toBe(400)
    expect(deleteUserMock).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/user', () => {
  it('accepts notifyWrapped and writes it through the allowlist', async () => {
    const res = await PATCH(patchRequest({ notifyWrapped: false }))
    expect(res.status).toBe(200)
    expect(usersUpdateOneMock).toHaveBeenCalledWith({ _id: 'user_a' }, { $set: { notifyWrapped: false } })
  })

  it('drops a non-boolean notifyWrapped instead of writing it', async () => {
    const res = await PATCH(patchRequest({ notifyWrapped: 'yes' }))
    expect(res.status).toBe(400)
    expect(usersUpdateOneMock).not.toHaveBeenCalled()
  })

  it('writes a valid hiddenFeatures list, deduplicated', async () => {
    const res = await PATCH(patchRequest({ hiddenFeatures: ['insights', 'wrapped', 'insights'] }))
    expect(res.status).toBe(200)
    expect(usersUpdateOneMock).toHaveBeenCalledWith({ _id: 'user_a' }, { $set: { hiddenFeatures: ['insights', 'wrapped'] } })
  })

  it('accepts an empty hiddenFeatures list to show everything again', async () => {
    const res = await PATCH(patchRequest({ hiddenFeatures: [] }))
    expect(res.status).toBe(200)
    expect(usersUpdateOneMock).toHaveBeenCalledWith({ _id: 'user_a' }, { $set: { hiddenFeatures: [] } })
  })

  it('rejects unknown or non-array hiddenFeatures', async () => {
    expect((await PATCH(patchRequest({ hiddenFeatures: ['envelopes'] }))).status).toBe(400)
    expect((await PATCH(patchRequest({ hiddenFeatures: 'insights' }))).status).toBe(400)
    expect(usersUpdateOneMock).not.toHaveBeenCalled()
  })

  it('records guided-tour completion with the server clock', async () => {
    const res = await PATCH(patchRequest({ guidedTourCompleted: true }))
    expect(res.status).toBe(200)
    expect(usersUpdateOneMock).toHaveBeenCalledWith(
      { _id: 'user_a', guidedTourCompletedAt: { $in: [null, undefined] } },
      { $set: { guidedTourCompletedAt: expect.any(String) } },
    )
  })

  it('does not accept a client-supplied guided-tour timestamp', async () => {
    const res = await PATCH(patchRequest({ guidedTourCompletedAt: '2000-01-01T00:00:00.000Z' }))
    expect(res.status).toBe(400)
    expect(usersUpdateOneMock).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/user currency', () => {
  it('stores only the selected currency without touching monetary records', async () => {
    const res = await PATCH(patchRequest({ currencyCode: 'USD' }))
    expect(res.status).toBe(200)
    expect(usersUpdateOneMock).toHaveBeenCalledWith({ _id: 'user_a' }, { $set: { currencyCode: 'USD' } })
  })
  it.each(['BTC', 'usd', 'BGN', '', null, 123])('rejects unsupported currency %s', async currencyCode => {
    const res = await PATCH(patchRequest({ currencyCode }))
    expect(res.status).toBe(400)
    expect(usersUpdateOneMock).not.toHaveBeenCalled()
  })
  it('stores a valid IANA timezone', async () => {
    const res = await PATCH(patchRequest({ timezone: 'America/New_York' }))
    expect(res.status).toBe(200)
    expect(usersUpdateOneMock).toHaveBeenCalledWith({ _id: 'user_a' }, { $set: { timezone: 'America/New_York' } })
  })
  it.each(['Mars/Base', '', null, 5])('rejects invalid timezone %s', async timezone => {
    const res = await PATCH(patchRequest({ timezone }))
    expect(res.status).toBe(400)
    expect(usersUpdateOneMock).not.toHaveBeenCalled()
  })
  it('returns INR for a legacy profile without currency', async () => {
    const res = await PATCH(patchRequest({ name: 'Test' }))
    expect((await res.json()).currencyCode).toBe('INR')
  })
})

/**
 * Every app version already on Play finishes onboarding by PATCHing
 * `{ currencyCode, onboardedAt }` here. Those installs keep calling this
 * deployed API for as long as their users take to update, so the route has to
 * keep honouring that body — the trial just starts from the server's clock
 * now instead of the device's.
 */
describe('PATCH /api/user — onboarding from a released app version', () => {
  it('accepts the legacy body and completes onboarding server-side', async () => {
    const res = await PATCH(patchRequest({ currencyCode: 'USD', onboardedAt: '2020-01-01T00:00:00.000Z' }))
    expect(res.status).toBe(200)
    expect(completeOnboardingMock).toHaveBeenCalled()
  })

  it('never lets the client-supplied instant reach the database', async () => {
    await PATCH(patchRequest({ currencyCode: 'USD', onboardedAt: '2020-01-01T00:00:00.000Z' }))
    // A device clock — or a forged body — must not be able to move the trial.
    expect(JSON.stringify(usersUpdateOneMock.mock.calls)).not.toContain('onboardedAt')
    expect(JSON.stringify(completeOnboardingMock.mock.calls)).not.toContain('2020')
  })

  it('still writes the currency that rode along in the same request', async () => {
    await PATCH(patchRequest({ currencyCode: 'USD', onboardedAt: '2020-01-01T00:00:00.000Z' }))
    expect(usersUpdateOneMock).toHaveBeenCalledWith({ _id: 'user_a' }, { $set: { currencyCode: 'USD' } })
  })

  it('does not strand the user when our setup check disagrees with their app', async () => {
    // Released builds cannot be fixed by redeploying the API. If this path
    // rejected them, the user would sit on the setup screen retrying a
    // request that fails every time, with no way forward. New clients use
    // POST /api/onboarding/complete, which stays strict because they can
    // react to a 409 by retrying once their writes land.
    completeOnboardingMock.mockResolvedValueOnce({ ok: false, reason: 'setup_incomplete' } as never)
    const res = await PATCH(patchRequest({ currencyCode: 'USD', onboardedAt: '2020-01-01T00:00:00.000Z' }))
    expect(res.status).toBe(200)
    expect(completeOnboardingMock).toHaveBeenCalledWith(expect.anything(), 'user_a', expect.any(Date), { requireSetup: false })
  })

  it('leaves an ordinary settings change alone — no onboardedAt key, no trial', async () => {
    const res = await PATCH(patchRequest({ notifyCadence: 'weekly' }))
    expect(res.status).toBe(200)
    expect(completeOnboardingMock).not.toHaveBeenCalled()
  })
})
