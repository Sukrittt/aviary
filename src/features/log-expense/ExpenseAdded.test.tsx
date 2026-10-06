import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { currentMonthKey } from '@/src/lib/envelope'
import { ExpenseAdded, type AddedExpense } from './ExpenseAdded'

const month = currentMonthKey()

// Keep the tick's dynamic chunk loading for every test. The receipt must still render.
vi.mock('next/dynamic', () => ({ default: (_loader: unknown, options: { loading: () => unknown }) => options.loading }))
vi.mock('@lottiefiles/dotlottie-react', () => ({ DotLottieReact: () => null }))
vi.mock('@/components/AppearanceProvider', () => ({ useAppearance: () => ({ theme: 'dark' }) }))
vi.mock('@/src/context/CurrencyContext', () => ({
  useCurrency: () => ({ formatMoney: (n: number) => `₹${n}`, formatCurrency: (n: number) => `₹${n}` }),
}))
vi.mock('@/src/hooks/useBudgets', () => ({
  useBudgets: () => ({ data: [{ month, category: 'Groceries', assigned: '1000', rolled_over: '0', version: 1 }] }),
}))
// The refetch hasn't landed: the new row isn't in the list yet, so the view charges it by hand.
vi.mock('@/src/hooks/useExpenses', () => ({
  useRecentExpenses: () => ({ data: [{ timestamp: 'old', date: `${month}-01`, item: 'Eggs', amount_inr: '200', category: 'Groceries' }] }),
}))
vi.mock('@/src/hooks/useCategories', () => ({ useCategories: () => ({ data: [{ name: 'Groceries', group: 'Needs' }] }) }))
vi.mock('@/src/hooks/useGroups', () => ({ useGroups: () => ({ data: ['Needs'] }) }))

function expense(overrides: Partial<AddedExpense> = {}): AddedExpense {
  return {
    id: 'e1',
    timestamp: 'new',
    item: 'Milk',
    category: 'Groceries',
    date: `${month}-10`,
    amount: 300,
    loggedAt: new Date().toISOString(),
    ...overrides,
  }
}

function renderAdded(e: AddedExpense, handlers = { onUndo: vi.fn(), onDone: vi.fn() }) {
  render(<ExpenseAdded expense={e} undoing={false} undoError="" {...handlers} />)
  return handlers
}

describe('ExpenseAdded', () => {
  it('shows the envelope card with the budget this expense came out of', () => {
    renderAdded(expense())
    expect(screen.getByText('Milk')).toBeInTheDocument()
    expect(screen.getByText('left of ₹1000')).toBeInTheDocument()
    expect(screen.getByText(/days left|Less than 24 hrs/)).toBeInTheDocument()
  })

  it('skips the card for an expense logged to a past month', () => {
    renderAdded(expense({ date: '2020-01-05' }))
    expect(screen.queryByText(/left of/)).not.toBeInTheDocument()
  })

  it('offers Undo only when the row has an id to delete by', () => {
    const handlers = renderAdded(expense())
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(handlers.onUndo).toHaveBeenCalledOnce()
    expect(handlers.onDone).toHaveBeenCalledOnce()
  })

  it('hides Undo without an id', () => {
    renderAdded(expense({ id: undefined }))
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })
})


it('shows spending impact for a newly created category before the category list refreshes', () => {
  renderAdded(expense({ category: 'Bike repairs', amount: 20, categorySnapshot: { name: 'Bike repairs', group: 'Needs' } }))
  expect(screen.getByText('Bike repairs')).toBeInTheDocument()
  expect(screen.getByText('No budget assigned')).toBeInTheDocument()
  expect(screen.getByText('spent this month')).toBeInTheDocument()
  expect(document.querySelector('.erd-added-bar')).toBeInTheDocument()
  expect(screen.queryByText(/\/day to stay on track/)).not.toBeInTheDocument()
})


it('reserves the tick area and renders the full receipt while the animation chunk loads', () => {
  renderAdded(expense())
  expect(document.querySelector('.erd-added-tick')).toBeInTheDocument()
  expect(screen.getByText('Milk')).toBeInTheDocument()
  expect(screen.getByText('left of ₹1000')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
})
