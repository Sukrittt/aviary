import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/access', () => ({ getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null })) }))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: vi.fn(async () => null) }))
vi.mock('@/lib/userCurrency', () => ({ nowForUser: async () => ({ date: '2026-10-19', timestamp: '' }) }))
vi.mock('@/lib/ai/expenseContext', () => ({
  buildExpenseContext: async () => ({
    envelopes: [
      { category: 'Food', available: 5000, isCreditCardPayment: false },
      { category: 'Card', available: 900, isCreditCardPayment: true },
    ],
  }),
}))

// Mongo hands back strings for encrypted numbers; the route has to coerce them.
const docs: Record<string, Record<string, unknown>[]> = {
  expenses: [
    { date: '2026-07-01', amount_inr: '9200', category: 'Food' },
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
  it('forecasts from the stored rows, card envelopes left out', async () => {
    const body = await (await GET(new Request('https://example.com/api/forecast'))).json()
    expect(body.basis).toBe('history')
    // 9200 over Jul–Sep's 92 days = 100/day; 5000 − 300 − 100 − 100 × 12.
    expect(body.envelopes).toEqual([
      { category: 'Food', available: 5000, scheduled: 400, usualDaily: 100, projected: 3400, runsOutOn: null, overspent: false },
    ])
    expect(body.nextMonth).toEqual({ month: '2026-11', income: 80000, spokenFor: 400, free: 79600 })
  })
})
