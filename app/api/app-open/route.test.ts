import { describe, it, expect, vi } from 'vitest'

const seen: Request[] = []
const answer = (body: unknown, status = 200) => vi.fn<Handler>(async (req) => {
  seen.push(req)
  return Response.json(body, { status })
})
type Handler = (req: Request) => Promise<Response>
const handlers = vi.hoisted(() => ({}) as Record<string, Handler>)

vi.mock('../user/route', () => ({ GET: (r: Request) => handlers.user(r) }))
vi.mock('../budgets/route', () => ({ GET: (r: Request) => handlers.budgets(r) }))
vi.mock('../groups/route', () => ({ GET: (r: Request) => handlers.groups(r) }))
vi.mock('../accounts/route', () => ({ GET: (r: Request) => handlers.accounts(r) }))
vi.mock('../budgets/carry/route', () => ({ GET: vi.fn() }))
vi.mock('../categories/route', () => ({ GET: vi.fn() }))
vi.mock('../spaces/route', () => ({ GET: vi.fn() }))
vi.mock('../billing/status/route', () => ({ GET: vi.fn() }))
vi.mock('../category-map/route', () => ({ GET: vi.fn() }))
vi.mock('../incomes/route', () => ({ GET: vi.fn() }))
vi.mock('../recurring-incomes/route', () => ({ GET: vi.fn() }))
vi.mock('../import/status/route', () => ({ GET: vi.fn() }))
vi.mock('../changelog/latest/route', () => ({ GET: vi.fn() }))
vi.mock('../wrapped/status/route', () => ({ GET: vi.fn() }))
vi.mock('../expenses/duplicates/route', () => ({ GET: vi.fn() }))
vi.mock('../recap/route', () => ({ GET: vi.fn() }))
vi.mock('../recurring-expenses/suggestions/route', () => ({ GET: vi.fn() }))
vi.mock('../system/status/route', () => ({ GET: vi.fn() }))

const { GET } = await import('./route')

const call = (...paths: string[]) => {
  const url = new URL('https://www.useaviary.com/api/app-open')
  for (const p of paths) url.searchParams.append('p', p)
  return GET(new Request(url, { headers: { Authorization: 'Bearer t', 'x-aviary-budget': 'sp_1' } }))
}

describe('GET /api/app-open', () => {
  it("runs each listed route's own GET with the caller's headers and query string", async () => {
    handlers.user = answer({ id: 'u' })
    handlers.groups = answer([{ name: 'Bills' }])
    handlers.budgets = answer({ error: 'SUBSCRIPTION_REQUIRED' }, 402)
    const res = await call('/api/user', '/api/groups?icons=1', '/api/budgets')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({
      '/api/user': { status: 200, body: { id: 'u' } },
      '/api/groups?icons=1': { status: 200, body: [{ name: 'Bills' }] },
      // The gate's answer passes through as is, for the app to retry for real.
      '/api/budgets': { status: 402, body: { error: 'SUBSCRIPTION_REQUIRED' } },
    })
    const groupsReq = seen.find((r) => r.url.includes('/api/groups'))!
    expect(groupsReq.url).toBe('https://www.useaviary.com/api/groups?icons=1')
    expect(groupsReq.method).toBe('GET')
    expect(groupsReq.headers.get('authorization')).toBe('Bearer t')
    expect(groupsReq.headers.get('x-aviary-budget')).toBe('sp_1')
  })

  it('404s a path that is not on the list, or on another origin, without running anything', async () => {
    handlers.user = answer({ id: 'u' })
    seen.length = 0
    const body = await (await call('/api/expenses', '/api/user/sessions', 'https://evil.example/api/user', '//evil.example/api/user')).json()
    expect(Object.values(body)).toEqual(Array(4).fill({ status: 404, body: null }))
    expect(seen).toEqual([])
  })

  it('a route that throws is a 500 slice; the rest still answer', async () => {
    handlers.accounts = vi.fn<Handler>(async () => { throw new Error('boom') })
    handlers.user = answer({ id: 'u' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await (await call('/api/accounts', '/api/user')).json()).toEqual({
      '/api/accounts': { status: 500, body: null },
      '/api/user': { status: 200, body: { id: 'u' } },
    })
  })

  it('needs at least one path and caps how many', async () => {
    expect((await call()).status).toBe(400)
    expect((await call(...Array.from({ length: 31 }, (_, i) => `/api/user?n=${i}`))).status).toBe(400)
  })

  it('runs a repeated path once', async () => {
    handlers.user = answer({ id: 'u' })
    expect(await (await call('/api/user', '/api/user', '/api/user')).json()).toEqual({ '/api/user': { status: 200, body: { id: 'u' } } })
    expect(handlers.user).toHaveBeenCalledTimes(1)
  })
})
