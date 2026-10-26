import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toLocalDateString } from '@/src/lib/date'
import { darkTokens } from '@/src/theme/tokens'
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
// ₹5000 income, ₹1000 to Groceries: ₹4000 still in Ready to Assign.
const budgets = vi.hoisted(() => ({ income: '5000' }))
vi.mock('@/src/hooks/useBudgets', () => ({
  useBudgets: () => ({
    data: [
      { month, category: '__income__', assigned: budgets.income, rolled_over: '0', version: 1 },
      { month, category: 'Groceries', assigned: '1000', rolled_over: '0', version: 1 },
    ],
  }),
  useCarry: () => ({ data: undefined }),
}))
// The refetch hasn't landed: the new row isn't in the list yet, so the view charges it by hand.
const rows = vi.hoisted(() => ({ extra: [] as object[] }))
vi.mock('@/src/hooks/useExpenses', () => ({
  useRecentExpenses: () => ({ data: [{ timestamp: 'old', date: `${month}-01`, item: 'Eggs', amount_inr: '200', category: 'Groceries' }, ...rows.extra] }),
}))
const user = vi.hoisted(() => ({ hasPhonePush: false }))
vi.mock('@/src/hooks/useUser', () => ({ useUser: () => ({ data: { _id: 'me', hasPhonePush: user.hasPhonePush } }) }))
vi.mock('@/src/hooks/useAuthors', () => ({ useAuthors: () => null }))
vi.mock('@/src/hooks/useCategories', () => ({ useCategories: () => ({ data: [{ name: 'Groceries', group: 'Needs' }] }) }))
vi.mock('@/src/hooks/useGroups', () => ({ useGroups: () => ({ data: ['Needs'] }), useGroupIcons: () => new Map() }))

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

function renderAdded(e: AddedExpense, handlers = { onUndo: vi.fn(), onDone: vi.fn(), onSetBudget: vi.fn(), onCover: vi.fn() }) {
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


it('asks to budget a category with no money assigned this month, instead of the envelope card', () => {
  const handlers = renderAdded(expense({ category: 'Bike repairs', amount: 20, categorySnapshot: { name: 'Bike repairs', group: 'Needs' } }))
  expect(screen.getByText('Added')).toBeInTheDocument()
  expect(screen.queryByText(/left of/)).not.toBeInTheDocument()
  expect(screen.getByText('Give Bike repairs a budget?')).toBeInTheDocument()
  expect(screen.getByText("Nothing's assigned to it this month.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Set a budget' }))
  expect(handlers.onSetBudget).toHaveBeenCalledOnce()
})

it("doesn't ask to budget an unfunded category when there's nothing left to assign", () => {
  // Assign Money only takes amounts up to Ready to Assign, so the form couldn't save.
  budgets.income = '1000'
  try {
    renderAdded(expense({ category: 'Bike repairs', amount: 20, categorySnapshot: { name: 'Bike repairs', group: 'Needs' } }))
    expect(screen.queryByText(/a budget\?/)).not.toBeInTheDocument()
  } finally {
    budgets.income = '5000'
  }
})

it("doesn't ask to budget an unfunded category for a past-month expense", () => {
  renderAdded(expense({ category: 'Bike repairs', date: '2020-01-05', categorySnapshot: { name: 'Bike repairs', group: 'Needs' } }))
  expect(screen.queryByText(/a budget\?/)).not.toBeInTheDocument()
})

it('shows an overspend as "Over by" with a way to cover it, never a negative left or per-day', () => {
  // ₹1000 assigned, ₹200 already spent, so ₹900 more lands ₹100 over.
  const handlers = renderAdded(expense({ amount: 900 }))
  expect(screen.getByText('Over by ₹100')).toBeInTheDocument()
  expect(screen.queryByText(/left of/)).not.toBeInTheDocument()
  expect(screen.queryByText(/\/day/)).not.toBeInTheDocument()
  expect(screen.getByText('Cover it from another category?')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cover it' }))
  expect(handlers.onCover).toHaveBeenCalledOnce()
})

it('keeps the usual left and per-day lines when the envelope lands exactly on zero', () => {
  renderAdded(expense({ amount: 800 }))
  expect(screen.getByText('left of ₹1000')).toBeInTheDocument()
  expect(screen.queryByText(/Over by/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Cover it' })).not.toBeInTheDocument()
})


it('reserves the tick area and renders the full receipt while the animation chunk loads', () => {
  renderAdded(expense())
  expect(document.querySelector('.erd-added-tick')).toBeInTheDocument()
  expect(screen.getByText('Milk')).toBeInTheDocument()
  expect(screen.getByText('left of ₹1000')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
})

describe('habit progress', () => {
  // Pooled habits look back from the real today, so these dates move with the clock.
  const daysAgo = (n: number) => toLocalDateString(new Date(Date.now() - n * 86_400_000))
  const milk = (date: string) => ({ id: `m-${date}`, date, item: 'Milk', timestamp: `${date}T09:00:00+05:30`, amount_inr: '50', category: 'Groceries', source: 'manual' })
  const now = () => expense({ date: daysAgo(0), timestamp: `${daysAgo(0)}T09:30:00+05:30` })

  beforeEach(() => {
    user.hasPhonePush = true
    rows.extra = []
  })
  afterEach(() => {
    user.hasPhonePush = false
    rows.extra = []
  })

  it('counts toward a nudge from the second day, on the mint pill', () => {
    rows.extra = [milk(daysAgo(1))]
    renderAdded(now())
    const line = screen.getByText('Seen your milk 2 times. Nudges start after one more.')
    // The theme is mocked to dark.
    expect(line).toHaveStyle({ background: darkTokens.successBg, color: darkTokens.onSuccess })
  })

  it('promises a nudge once it is a habit', () => {
    rows.extra = [milk(daysAgo(1)), milk(daysAgo(2))]
    renderAdded(now())
    expect(screen.getByText("Noted. You'll get a nudge next time.")).toBeInTheDocument()
  })

  it('says nothing after a first log', () => {
    renderAdded(now())
    expect(screen.queryByText(/Seen your|nudge/)).toBeNull()
  })

  it("doesn't promise nudges without a phone that can get them", () => {
    user.hasPhonePush = false
    rows.extra = [milk(daysAgo(1)), milk(daysAgo(2))]
    renderAdded(now())
    expect(screen.queryByText(/nudge/)).toBeNull()
  })
})
