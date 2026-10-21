import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const getBudgets = vi.fn()
const switchBudget = vi.fn()
vi.mock('@/src/api/spaces', () => ({ getBudgets: () => getBudgets(), switchBudget: (b: unknown) => switchBudget(b) }))

const { useSpaces } = await import('./useSpaces')

const member = (id: string, personal = false) => ({ id, name: id, emoji: '🏠', role: personal ? 'owner' : 'member', personal, members: [] })
function run() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return renderHook(() => useSpaces(), { wrapper })
}

describe('useSpaces', () => {
  beforeEach(() => {
    switchBudget.mockClear()
    document.cookie = 'aviary-budget=; path=/; max-age=0'
  })

  it('opens the shared budget the server picked when there is no personal one and no cookie', async () => {
    // Joined from an invite, so no personal budget. On a new browser (or after
    // logging out) there's no cookie, and every request read a budget that doesn't exist.
    getBudgets.mockResolvedValue({ budgets: [member('sp_home')], count: 1, limit: 5, activeId: 'sp_home' })
    run()
    await waitFor(() => expect(switchBudget).toHaveBeenCalledWith(expect.objectContaining({ id: 'sp_home' })))
  })

  it('leaves the personal budget alone', async () => {
    getBudgets.mockResolvedValue({ budgets: [member('user_1', true), member('sp_home')], count: 2, limit: 5, activeId: 'user_1' })
    const { result } = run()
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(switchBudget).not.toHaveBeenCalled()
  })

  it('does nothing when the cookie already names the open budget', async () => {
    document.cookie = 'aviary-budget=sp_home; path=/'
    getBudgets.mockResolvedValue({ budgets: [member('sp_home')], count: 1, limit: 5, activeId: 'sp_home' })
    const { result } = run()
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(switchBudget).not.toHaveBeenCalled()
  })
})
