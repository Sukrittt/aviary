import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { queryWrapper } from '../test-utils/queryWrapper'

const { getBudgets, getBudgetCategories, moveExpense } = vi.hoisted(() => ({
  getBudgets: vi.fn(),
  getBudgetCategories: vi.fn(),
  moveExpense: vi.fn(),
}))
vi.mock('../api/spaces', () => ({ getBudgets, getBudgetCategories, moveExpense }))

const { MoveExpenseDialog } = await import('./MoveExpenseDialog')

const member = [{ userId: 'u1', name: 'Sukrit', avatarUrl: null, role: 'owner' as const, joinedAt: null }]
getBudgets.mockResolvedValue({
  budgets: [
    { id: 'u1', name: 'Personal', emoji: '🐦', role: 'owner', ownerId: 'u1', currencyCode: 'INR', personal: true, members: member },
    { id: 's1', name: 'Home', emoji: '🏠', role: 'owner', ownerId: 'u1', currencyCode: 'INR', personal: false, members: member },
  ],
  count: 2,
  limit: 5,
  activeId: 'u1',
})

describe('MoveExpenseDialog', () => {
  it("moves the expense by id and version into the other budget's matching category", async () => {
    getBudgetCategories.mockResolvedValue([{ name: 'Rent' }, { name: '🛒 Groceries' }])
    moveExpense.mockResolvedValue({ ok: true, id: 'e1', version: 4 })
    const onMoved = vi.fn()
    render(<MoveExpenseDialog id="e1" version={3} category="Groceries" onClose={vi.fn()} onMoved={onMoved} />, { wrapper: queryWrapper() })

    // The only other budget is preselected, and so is its category of the same name.
    const groceries = await screen.findByRole('radio', { name: /Groceries/ })
    expect(getBudgetCategories).toHaveBeenCalledWith('s1')
    expect(groceries.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('radio', { name: /Rent/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Move to 🏠 Home' }))
    await waitFor(() => expect(moveExpense).toHaveBeenCalledWith({ id: 'e1', version: 3, to: 's1', category: 'Rent' }))
    await waitFor(() => expect(onMoved).toHaveBeenCalled(), { timeout: 2000 })
  })
})
