import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import type { DehydratedState } from '@tanstack/react-query'

vi.mock('server-only', () => ({}))
const redirect = vi.fn((path: string) => { throw new Error(`redirect:${path}`) })
vi.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }))
vi.mock('../../src/views/ExpensePage', () => ({ ExpensePage: () => null }))
let mockAmountsCookie: string | undefined = 'shown'
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'mc-amounts' && mockAmountsCookie ? { value: mockAmountsCookie } : undefined) }),
}))

const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status })
const handlers = {
  user: vi.fn(json({ _id: 'user_1', onboardedAt: '2026-01-01T00:00:00.000Z', currencyCode: 'USD' })),
  budgets: vi.fn(json({ headers: [], rows: [{ category: 'Rent' }] })),
  expenses: vi.fn(json({ headers: [], rows: [{ item: 'Chai' }], lastSpent: { Food: '2026-10-01' } })),
  categories: vi.fn(json([{ name: 'Rent' }])),
  groups: vi.fn(json(['Essentials'])),
  subscriptions: vi.fn(json({ headers: [], rows: [] })),
}
vi.mock('../api/user/route', () => ({ GET: () => handlers.user() }))
vi.mock('../api/budgets/route', () => ({ GET: () => handlers.budgets() }))
vi.mock('../api/expenses/route', () => ({ GET: () => handlers.expenses() }))
vi.mock('../api/categories/route', () => ({ GET: () => handlers.categories() }))
vi.mock('../api/groups/route', () => ({ GET: () => handlers.groups() }))
vi.mock('../api/subscriptions/route', () => ({ GET: () => handlers.subscriptions() }))

const { default: ExpenseRoute } = await import('./page')

/** The dehydrated cache the page hands to the client, keyed by query key. */
async function render() {
  const tree = (await ExpenseRoute()) as ReactElement<{ state: DehydratedState; children: ReactElement<{ code?: string }> }>
  const queries = Object.fromEntries(tree.props.state.queries.map((q) => [JSON.stringify(q.queryKey), q.state.data]))
  return { queries, currency: tree.props.children.props.code }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAmountsCookie = 'shown'
})

describe('/expense server render', () => {
  it('hands the client every home query, shaped like the hooks return them', async () => {
    const { queries, currency } = await render()
    expect(queries['["budgets"]']).toEqual([{ category: 'Rent' }])
    expect(queries['["categories"]']).toEqual([{ name: 'Rent' }])
    expect(queries['["groups"]']).toEqual(['Essentials'])
    expect(queries['["subscriptions"]']).toEqual([])
    expect(queries['["user"]']).toMatchObject({ _id: 'user_1' })
    const recent = Object.entries(queries).find(([k]) => k.startsWith('["expenses","recent"'))
    expect(recent?.[1]).toEqual({ rows: [{ item: 'Chai' }], lastSpent: { Food: '2026-10-01' } })
    expect(currency).toBe('USD')
  })

  it('sends an account that has not onboarded to /onboarding', async () => {
    handlers.user.mockImplementationOnce(json({ _id: 'user_1', onboardedAt: null }))
    await expect(render()).rejects.toThrow('redirect:/onboarding')
  })

  it('fails open when the profile cannot be read, leaving the failed query to the client', async () => {
    handlers.user.mockImplementationOnce(json({ error: 'boom' }, 500))
    handlers.budgets.mockImplementationOnce(json({ error: 'boom' }, 500))
    const { queries, currency } = await render()
    expect(redirect).not.toHaveBeenCalled()
    expect(queries['["user"]']).toBeUndefined()
    expect(queries['["budgets"]']).toBeUndefined()
    expect(queries['["groups"]']).toEqual(['Essentials'])
    expect(currency).toBeUndefined()
  })

  it.each([[undefined], ['hidden']])('leaves amounts out of the HTML when the amounts cookie is %s, but still checks onboarding', async (cookie) => {
    mockAmountsCookie = cookie
    const { queries } = await render()
    expect(Object.keys(queries)).toEqual(['["user"]'])
    expect(handlers.budgets).not.toHaveBeenCalled()

    handlers.user.mockImplementationOnce(json({ _id: 'user_1', onboardedAt: null }))
    await expect(render()).rejects.toThrow('redirect:/onboarding')
  })
})
