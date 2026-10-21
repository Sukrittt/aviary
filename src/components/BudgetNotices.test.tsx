import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { BUDGET_READ_ONLY_EVENT, LOST_BUDGET_KEY } from '../api/client'
import { HttpError } from '../api/client'

const spaces = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('../hooks/useSpaces', () => ({ useSpaces: () => spaces.value }))

const { BudgetNotices, ReadOnlyBanner, useReadOnlyError } = await import('./BudgetNotices')

const members = [
  { userId: 'u1', name: 'Priya Shah', avatarUrl: null, role: 'owner', joinedAt: null },
  { userId: 'u2', name: 'Rahul Rao', avatarUrl: null, role: 'member', joinedAt: '2026-10-12' },
]
const home = { id: 's1', name: 'Home', emoji: '🏠', role: 'member', ownerId: 'u1', members, personal: false }
const READ_ONLY = "This budget is read-only until Priya renews. Your data's safe, and export's always free."
const BANNER = "Read-onlyPriya's plan has lapsed. You can view and export everything; logging comes back once they renew."

beforeEach(() => {
  spaces.value = { active: home, readOnly: false, deleted: [], loaded: true }
  localStorage.setItem('aviary-budget-intro:s1', '1')
})
afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('read-only budget', () => {
  it("shows the banner when the owner's plan lapsed", () => {
    spaces.value = { ...spaces.value, readOnly: true }
    render(<ReadOnlyBanner />)
    expect(screen.getByRole('status').textContent).toBe(BANNER)
  })

  it('shows it the moment a write comes back 402, before the list catches up', () => {
    render(<ReadOnlyBanner />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => { window.dispatchEvent(new Event(BUDGET_READ_ONLY_EVENT)) })
    expect(screen.getByRole('status').textContent).toBe(BANNER)
  })

  it("turns a member's 402 into that message, never the subscribe one", () => {
    const { result } = renderHook(() => useReadOnlyError())
    expect(result.current(new HttpError(402, 'Failed to add expense: 402'))).toBe(READ_ONLY)
    expect(result.current(new HttpError(500, 'x'))).toBeNull()
    spaces.value = { ...spaces.value, active: { ...home, role: 'owner' } }
    const owner = renderHook(() => useReadOnlyError())
    expect(owner.result.current(new HttpError(402, 'x'))).toBeNull()
  })
})

describe('lost budget notice', () => {
  it("says you're no longer in it", () => {
    sessionStorage.setItem(LOST_BUDGET_KEY, JSON.stringify({ id: 's1', name: 'Home' }))
    render(<BudgetNotices />)
    expect(screen.getByRole('alertdialog', { name: "You're no longer in Home budget." })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(sessionStorage.getItem(LOST_BUDGET_KEY)).toBeNull()
  })

  it('says who deleted it', () => {
    sessionStorage.setItem(LOST_BUDGET_KEY, JSON.stringify({ id: 's1', name: 'Home' }))
    spaces.value = { ...spaces.value, active: undefined, deleted: [{ id: 's1', name: 'Home', emoji: '🏠', deletedAt: '2026-10-19', deletedBy: 'Priya', canRestore: false }] }
    render(<BudgetNotices />)
    expect(screen.getByRole('alertdialog', { name: 'Home budget was deleted by Priya.' })).toBeTruthy()
  })
})

describe('first-run intro', () => {
  it('shows two cards once for a budget you joined', () => {
    localStorage.clear()
    const { unmount } = render(<BudgetNotices />)
    expect(screen.getByRole('dialog', { name: 'You and Priya share this budget' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog', { name: 'Switch budgets from here' })).toBeTruthy()
    // Someone who only joined has no budget of their own, and on desktop the chip sits in the sidebar.
    expect(screen.getByText('Tap the budget chip to hop between your budgets.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    unmount()
    render(<BudgetNotices />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it("doesn't show in a budget you own", () => {
    localStorage.clear()
    spaces.value = { ...spaces.value, active: { ...home, role: 'owner' } }
    render(<BudgetNotices />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
