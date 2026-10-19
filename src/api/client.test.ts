import { describe, it, expect, vi, afterEach } from 'vitest'
import { ACTIVE_BUDGET_KEY, BUDGET_READ_ONLY_EVENT, LOST_BUDGET_KEY, apiFetch, budgetCookie, setBudgetCookie } from './client'

const denied = (spaceId: string) => new Response(JSON.stringify({ error: 'NOT_A_MEMBER', spaceId }), { status: 403 })
const reload = vi.fn()

afterEach(() => {
  setBudgetCookie(null)
  vi.unstubAllGlobals()
  reload.mockReset()
})

describe('apiFetch and the budget cookie', () => {
  it('drops a cookie naming a budget you lost, and reloads into your own', async () => {
    vi.stubGlobal('location', { reload })
    vi.stubGlobal('fetch', vi.fn(async () => denied('s1')))
    setBudgetCookie('s1')
    expect(budgetCookie()).toBe('s1')
    await apiFetch('/api/expenses')
    expect(budgetCookie()).toBeNull()
    expect(reload).toHaveBeenCalled()
  })

  it("keeps the cookie when the denied budget isn't the active one", async () => {
    vi.stubGlobal('location', { reload })
    vi.stubGlobal('fetch', vi.fn(async () => denied('s2')))
    setBudgetCookie('s1')
    const resp = await apiFetch('/api/expenses/move', { method: 'POST' })
    expect(budgetCookie()).toBe('s1')
    expect(reload).not.toHaveBeenCalled()
    // The caller still gets to read the body.
    expect((await resp.json()).error).toBe('NOT_A_MEMBER')
  })
})

describe('apiFetch and a read-only budget', () => {
  it('announces a 402 BUDGET_READ_ONLY so the banner can show', async () => {
    const heard = vi.fn()
    window.addEventListener(BUDGET_READ_ONLY_EVENT, heard)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'BUDGET_READ_ONLY' }), { status: 402 })))
    const resp = await apiFetch('/api/expenses', { method: 'POST' })
    expect(heard).toHaveBeenCalledTimes(1)
    expect(resp.status).toBe(402)
    window.removeEventListener(BUDGET_READ_ONLY_EVENT, heard)
  })

  it("stays quiet for the owner's own subscribe 402", async () => {
    const heard = vi.fn()
    window.addEventListener(BUDGET_READ_ONLY_EVENT, heard)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'SUBSCRIPTION_REQUIRED' }), { status: 402 })))
    await apiFetch('/api/expenses', { method: 'POST' })
    expect(heard).not.toHaveBeenCalled()
    window.removeEventListener(BUDGET_READ_ONLY_EVENT, heard)
  })
})

describe('losing the open budget', () => {
  it('remembers its name for the notice after the reload', async () => {
    vi.stubGlobal('location', { reload })
    vi.stubGlobal('fetch', vi.fn(async () => denied('s1')))
    localStorage.setItem(ACTIVE_BUDGET_KEY, JSON.stringify({ id: 's1', name: 'Home' }))
    setBudgetCookie('s1')
    await apiFetch('/api/expenses')
    expect(JSON.parse(sessionStorage.getItem(LOST_BUDGET_KEY)!)).toEqual({ id: 's1', name: 'Home' })
    sessionStorage.clear()
    localStorage.clear()
  })
})
