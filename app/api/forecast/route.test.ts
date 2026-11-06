import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/access', () => ({ getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null })) }))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: vi.fn(async () => null) }))
vi.mock('@/lib/userCurrency', () => ({ nowForUser: async () => ({ date: '2026-10-19', timestamp: '' }) }))
const context = vi.hoisted(() => ({
  envelopes: [
    { category: 'Food', available: 5000, isCreditCardPayment: false } as Record<string, unknown>,
    { category: 'Card', available: 900, isCreditCardPayment: true },
    // A savings goal: saved money, so the forecast leaves it out like the card.
    { category: 'Holiday', available: 9000, isCreditCardPayment: false },
  ],
  categories: [{ name: 'Holiday', isGoal: true }] as { name: string; isGoal?: boolean }[],
}))
vi.mock('@/lib/ai/expenseContext', () => ({ buildExpenseContext: async () => context }))

// Mongo hands back strings for encrypted numbers; the route has to coerce them.
const docs: Record<string, Record<string, unknown>[]> = {
  expenses: [
    { date: '2026-07-25', amount_inr: '1200', category: 'Food' },
    { date: '2026-08-25', amount_inr: '1200', category: 'Food' },
    { date: '2026-09-25', amount_inr: '1200', category: 'Food' },
    { date: '2026-09-01', amount_inr: '25000', category: 'Food', source: 'recurring' },
  ],
  recurring_expenses: [
    { category: 'Food', amount_inr: '300', frequency: 'monthly', start_date: '2026-01-25', end_date: '', next_run_date: '2026-10-25', status: 'active' },
  ],
  recurring_incomes: [{ amount: '80000', frequency: 'monthly', start_date: '2026-01-01', end_date: '', next_run_date: '2026-11-01', status: 'active' }],
  subscriptions: [{ service: 'Spotify', category: 'Food', amount_inr: '100', billing_cycle: 'monthly', next_due_date: '2026-10-30', status: 'active' }],
}
vi.mock('@/lib/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/http')>()),
  getCollection: async (name: string) => ({
    find: () => ({ toArray: async () => docs[name] }),
    findOne: async () => ({ date: '2026-06-28' }),
  }),
}))

const { GET } = await import('./route')

describe('GET /api/forecast', () => {
  it('forecasts from the stored rows, card and goal envelopes left out', async () => {
    const body = await (await GET(new Request('https://example.com/api/forecast'))).json()
    expect(body.basis).toBe('history')
    // Usually 1200 after the 19th = 100/day over 12 days; 5000 − 300 − 100 − 1200.
    expect(body.envelopes).toEqual([
      { category: 'Food', available: 5000, scheduled: 400, usualDaily: 100, projected: 3400, runsOutOn: null, overspent: false },
    ])
    expect(body.nextMonth).toEqual({ month: '2026-11', income: 80000, spokenFor: 400, free: 79600 })
  })

  it('passes the pending plan through, so payday counts in the forecast', async () => {
    context.envelopes[0] = { category: 'Food', available: 5000, assigned: 6000, planPending: true, isCreditCardPayment: false }
    docs.recurring_incomes[0].next_run_date = '2026-10-25'
    const body = await (await GET(new Request('https://example.com/api/forecast'))).json()
    expect(body.envelopes[0]).toMatchObject({ available: 5000, projected: 9400, runsOutOn: null })
  })
})
