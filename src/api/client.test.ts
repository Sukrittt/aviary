import { describe, it, expect, vi, afterEach } from 'vitest'
import { apiFetch, budgetCookie, setBudgetCookie } from './client'

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
