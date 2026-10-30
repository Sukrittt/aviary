import { describe, it, expect, vi, beforeEach } from 'vitest'

// Per-user "now" reads the users collection; these suites fake the clock via `nowIST` instead.
vi.mock('@/lib/userCurrency', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/userCurrency')>()),
  nowForUser: async () => (await import('@/lib/http')).nowIST(),
}))


const createExpense = vi.fn()

vi.mock('@/lib/createExpense', () => ({ createExpense }))

const { applySubscriptionExpense } = await import('./subscriptionExpense')

const auth = { userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const }

describe('applySubscriptionExpense', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createExpense.mockResolvedValue({ id: 'exp_1', timestamp: '2026-09-16T00:00:00', duplicate: false })
  })

  it('skips and does not insert when the subscription has no linked category', async () => {
    const result = await applySubscriptionExpense(auth, { service: 'Netflix', amount_inr: '199', category: '' })
    expect(result).toEqual({ ok: false, reason: 'no-category' })
    expect(createExpense).not.toHaveBeenCalled()
  })

  it('inserts an expense marked as auto-generated, in the linked category, keyed for same-day retries', async () => {
    const result = await applySubscriptionExpense(auth, {
      service: 'Netflix',
      amount_inr: '199',
      category: 'Entertainment',
    })

    expect(result).toEqual({ ok: true, id: 'exp_1', duplicate: false })
    expect(createExpense).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        item: 'Netflix',
        amount_inr: '199',
        category: 'Entertainment',
        notes: 'Auto-added from subscription',
        source: 'subscription',
        client_id: expect.stringMatching(/^sub:Netflix:\d{4}-\d{2}-\d{2}$/),
      }),
    )
  })

  it('appends the subscription notes after the auto-generated marker', async () => {
    await applySubscriptionExpense(auth, {
      service: 'Netflix',
      amount_inr: '199',
      category: 'Entertainment',
      notes: 'shared with family',
    })

    expect(createExpense).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ notes: 'Auto-added from subscription · shared with family' }),
    )
  })

  it('surfaces a same-day retry as a duplicate instead of inserting again', async () => {
    createExpense.mockResolvedValue({ id: 'exp_1', timestamp: '2026-09-16T00:00:00', duplicate: true })

    const result = await applySubscriptionExpense(auth, {
      service: 'Netflix',
      amount_inr: '199',
      category: 'Entertainment',
    })

    expect(result).toEqual({ ok: true, id: 'exp_1', duplicate: true })
  })
})

describe('applySubscriptionExpense with a row that can no longer be booked', () => {
  it("reports it rather than throwing, so one bad row doesn't stop the cron's other subscriptions", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    createExpense.mockRejectedValueOnce(new Error('amount must be a finite positive number'))
    const result = await applySubscriptionExpense(auth, { service: 'Netflix', amount_inr: 'abc', category: 'Fun' })
    expect(result).toEqual({ ok: false, reason: 'failed' })
  })
})
