import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { TransactionsView } from './TransactionsView'
import { ExpenseWriteError } from '../lib/expenseConflict'
import { avatarStyleFor } from '../lib/emoji'
const { remove, dismiss, duplicates, page, pageArgs } = vi.hoisted(() => ({
  pageArgs: [] as Record<string, unknown>[],
  remove: vi.fn(),
  dismiss: vi.fn(),
  duplicates: { data: [] as unknown[] },
  page: { extra: [] as unknown[] },
}))
const feedMocks = vi.hoisted(() => ({ user: {} as { activityFeed?: boolean } }))
vi.mock('../hooks/useUser', () => ({ useUser: () => ({ data: feedMocks.user }) }))
const spaceMocks = vi.hoisted(() => ({ value: { multi: false, budgets: [] } as Record<string, unknown> }))
vi.mock('../hooks/useSpaces', () => ({ useSpaces: () => spaceMocks.value }))
const importMocks = vi.hoisted(() => ({ importing: false }))
vi.mock('./ImportBanner', () => ({ useImportInProgress: () => importMocks.importing }))
vi.mock('../hooks/useAccounts', () => ({ useAccounts: () => ({ data: [] }), liveAccounts: () => [] }))
vi.mock('../hooks/useIncomes', () => ({ useIncomes: () => ({ data: incomeMocks.rows }) }))
const incomeMocks = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('../hooks/useBudgets', () => ({ useBudgets: () => ({ data: [{ category: 'Groceries' }] }) }))
vi.mock('../hooks/useCategories', () => ({ useCategories: () => ({ data: [{ name: 'Groceries' }, { name: 'Subscription' }] }), useCategoryIcons: () => new Map(), useCategoryStyle: () => (name: string) => avatarStyleFor(name) }))
vi.mock('../hooks/useRecentCategories', () => ({ useRecentCategories: () => ({ recents: [] }) }))
vi.mock('../hooks/useExpenses', () => ({
  useExpensesPage: (args: Record<string, unknown>) => (pageArgs.push(args), { data: { rows: [{ id: 'one', version: 0, timestamp: '2026-09-18T10:00:00', date: '2026-09-18', item: 'Lunch', amount_inr: '100', category: 'Food' }, ...page.extra], total: 1 + page.extra.length, pageCount: 1, totalAmount: 100 } }),
  useDeleteExpense: () => ({ mutateAsync: remove }),
  useDuplicates: () => duplicates,
  useDismissDuplicate: () => ({ mutateAsync: dismiss }),
  useExpensesFeed: () => ({
    data: { pages: [{ rows: [{ id: 'one', version: 0, timestamp: '2026-09-18T10:00:00', date: '2026-09-18', item: 'Lunch', amount_inr: '100', category: 'Food' }], page: 1, pageCount: 1 }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useUploadExpensePhoto: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

it('opens the transaction actions when the row is clicked', () => {
  render(<TransactionsView />)
  expect(screen.getByText('₹100', { selector: '.txn-timeline-amount' })).not.toHaveClass('is-expense')
  fireEvent.click(screen.getByRole('button', { name: 'Open actions for Lunch' }))
  expect(screen.getByText('Edit transaction')).toBeInTheDocument()
  expect(screen.getByText('Delete transaction')).toBeInTheDocument()
})

it('opens transaction deletion in a modal dialog instead of the row menu', () => {
  render(<TransactionsView />)
  fireEvent.click(screen.getByRole('button', { name: 'Open actions for Lunch' }))
  fireEvent.click(screen.getByText('Delete transaction'))

  expect(screen.getByRole('alertdialog', { name: 'Delete this transaction?' })).toBeInTheDocument()
  expect(screen.getByText('“Lunch” will move to Archive. You can restore it for 7 days.')).toBeInTheDocument()
  expect(screen.queryByText(/can't be undone/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('separates filters from date-grouped transaction rows', () => {
  render(<TransactionsView />)

  expect(screen.getByRole('heading', { name: 'Activity', level: 1 })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Activity filters' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Filter by category' })).toHaveTextContent('All categories')
  expect(screen.getByRole('searchbox', { name: 'Search transactions' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /18 September 2026/, level: 2 })).toBeInTheDocument()
  expect(screen.getByText('1 transaction', { selector: '.txn-timeline-header-count' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('tab', { name: 'This month' }))
  expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
})

it.each([[409, 'This transaction was updated'], [404, 'This transaction is already deleted']])('opens a friendly dialog after a delete returns %s', async (status, title) => {
  remove.mockReset().mockRejectedValueOnce(new ExpenseWriteError(Number(status), 'Raw API error'))
  render(<TransactionsView />)
  fireEvent.click(screen.getByRole('button', { name: 'Open actions for Lunch' }))
  fireEvent.click(screen.getByText('Delete transaction'))
  fireEvent.click(screen.getByText('Remove'))
  await screen.findByRole('dialog', { name: String(title) })
  expect(screen.queryByText('Raw API error')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Back to transactions'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(remove).toHaveBeenCalledTimes(1)
})

it('lists categories that have no budget row yet in the filter', () => {
  render(<TransactionsView />)
  fireEvent.click(screen.getByRole('combobox', { name: 'Filter by category' }))
  expect(screen.getByRole('option', { name: /Subscription/ })).toBeInTheDocument()
  expect(screen.getAllByRole('option', { name: /Groceries/ })).toHaveLength(1)
})

it('offers a review of flagged duplicates and can keep both', async () => {
  const row = (id: string, time: string) => ({ id, version: 0, timestamp: `2026-09-18T${time}`, date: '2026-09-18', item: 'Lunch', amount_inr: '100', category: 'Food' })
  duplicates.data = [{ duplicate: row('two', '10:05:00'), original: row('one', '10:00:00') }]
  render(<TransactionsView />)
  fireEvent.click(screen.getByRole('button', { name: 'Review 1 possible duplicate' }))
  await screen.findByRole('dialog', { name: 'Logged twice?' })
  fireEvent.click(screen.getByText('Keep both'))
  expect(dismiss).toHaveBeenCalledWith('two')
  duplicates.data = []
})

it('deletes the newer duplicate with a saving state and a tick, then closes', async () => {
  const row = (id: string, time: string) => ({ id, version: 3, timestamp: `2026-09-18T${time}`, date: '2026-09-18', item: 'Lunch', amount_inr: '100', category: 'Food' })
  duplicates.data = [{ duplicate: row('two', '10:05:00'), original: row('one', '10:00:00') }]
  let finish: () => void = () => {}
  remove.mockReset().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
  render(<TransactionsView />)
  fireEvent.click(screen.getByRole('button', { name: 'Review 1 possible duplicate' }))
  fireEvent.click(await screen.findByText('Delete the newer one'))

  expect(screen.getByText('Deleting…')).toBeInTheDocument()
  expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'two', version: 3 }))
  finish()
  expect(await screen.findByRole('img', { name: 'Deleted' })).toBeInTheDocument()
  // The refetch has already dropped the pair; the tick still plays on it.
  duplicates.data = []
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 2000 })
})

it('drops a deleted row right after its sweep, without waiting for the request', async () => {
  // A request that never settles: the row must still leave the list.
  remove.mockReset().mockReturnValue(new Promise(() => {}))
  render(<TransactionsView />)
  fireEvent.click(screen.getByRole('button', { name: 'Open actions for Lunch' }))
  fireEvent.click(screen.getByText('Delete transaction'))
  fireEvent.click(screen.getByText('Remove'))

  await waitFor(() => expect(remove).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.queryByText('Lunch')).not.toBeInTheDocument())
})

it('puts a row back when its delete fails', async () => {
  remove.mockReset().mockRejectedValueOnce(new Error('offline'))
  render(<TransactionsView />)
  fireEvent.click(screen.getByRole('button', { name: 'Open actions for Lunch' }))
  fireEvent.click(screen.getByText('Delete transaction'))
  fireEvent.click(screen.getByText('Remove'))

  await waitFor(() => expect(remove).toHaveBeenCalledOnce())
  expect(await screen.findByRole('button', { name: 'Open actions for Lunch' })).toBeInTheDocument()
})

describe('multi-select delete', () => {
  beforeEach(() => {
    page.extra = [{ id: 'two', version: 0, timestamp: '2026-09-18T11:00:00', date: '2026-09-18', item: 'Coffee', amount_inr: '50', category: 'Food' }]
  })
  afterEach(() => {
    page.extra = []
  })

  it('selects rows and deletes them one by one after a single confirm', async () => {
    remove.mockReset().mockResolvedValue(undefined)
    render(<TransactionsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Lunch' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('alertdialog', { name: 'Delete 2 transactions?' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Remove'))
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2))
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'one' }))
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'two' }))
    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument())
  })

  it('closes the select bar as soon as the delete is confirmed, before requests settle', async () => {
    let settle!: () => void
    remove.mockReset().mockImplementation(() => new Promise<void>((resolve) => { settle = resolve }))
    render(<TransactionsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Lunch' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByText('Remove'))
    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument())
    expect(remove).toHaveBeenCalledTimes(1)
    settle()
  })

  it('drops the selection when the filter changes', () => {
    render(<TransactionsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search transactions' }), { target: { value: 'x' } })
    expect(screen.getByText('Tap rows to pick them')).toBeInTheDocument()
  })

  it('puts failed rows back, still selected, with a friendly notice', async () => {
    remove.mockReset().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ExpenseWriteError(409, 'Raw API error'))
    render(<TransactionsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByText('Remove'))
    await screen.findByRole('dialog', { name: 'This transaction was updated' })
    expect(screen.queryByText('Raw API error')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Coffee' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Select Lunch' })).not.toBeInTheDocument())
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })
})

describe('income in Activity', () => {
  afterEach(() => {
    incomeMocks.rows = []
  })

  it('slots income in by date, signed and apart from the spend total', () => {
    incomeMocks.rows = [
      { id: 'i1', version: 0, date: '2026-09-17', amount: '50000', label: 'Salary', notes: '', account_id: '', recurring_id: 'r1', source: 'recurring', counted: 'monthly', created_at: '' },
      { id: 'i2', version: 0, date: '2026-08-01', amount: '9', label: 'Too old', notes: '', account_id: '', recurring_id: '', source: 'manual', counted: 'extra', created_at: '' },
    ]
    render(<TransactionsView />)
    expect(screen.getByRole('heading', { name: /17 September 2026/, level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Salary')).toBeInTheDocument()
    expect(screen.getByText('+₹50,000', { selector: '.txn-timeline-amount' })).toHaveClass('is-income')
    expect(screen.queryByText('Too old')).not.toBeInTheDocument()
    // The day's total is still what was spent.
    expect(screen.getByText('₹100', { selector: '.txn-timeline-header-total' })).toBeInTheDocument()
  })

  it('hides income under a category filter', async () => {
    incomeMocks.rows = [{ id: 'i1', version: 0, date: '2026-09-17', amount: '5', label: 'Gift', notes: '', account_id: '', recurring_id: '', source: 'manual', counted: 'extra', created_at: '' }]
    render(<TransactionsView />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Filter by category' }))
    await user.click(await screen.findByRole('option', { name: /Groceries/ }))
    // The row animates out, so it leaves the DOM a beat later.
    await waitFor(() => expect(screen.queryByText('Gift')).not.toBeInTheDocument())
  })
})

it('queries the calendar days it shows, not the day before, east of UTC', () => {
  // TZ is Asia/Kolkata (vitest.config.ts): local midnight is the previous day in UTC.
  render(<TransactionsView />)
  fireEvent.click(screen.getByRole('tab', { name: 'This month' }))
  expect(pageArgs.at(-1)).toMatchObject({ from: '2026-09-01', to: '2026-09-18' })
})

describe('feed view', () => {
  beforeEach(() => {
    feedMocks.user = { activityFeed: true }
  })
  afterEach(() => {
    feedMocks.user = {}
    window.localStorage.clear()
  })

  it('stays on the list with no switch until the feed is turned on in Features', () => {
    feedMocks.user = {}
    render(<TransactionsView />)
    expect(screen.getByRole('button', { name: 'Open actions for Lunch' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Feed' })).not.toBeInTheDocument()
  })

  it('opens on the feed once turned on, and switches to the list and back', () => {
    render(<TransactionsView />)
    expect(screen.getByRole('button', { name: 'Lunch, Food. View details' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByRole('button', { name: 'Open actions for Lunch' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Feed' }))
    expect(screen.getByRole('button', { name: 'Lunch, Food. View details' })).toBeInTheDocument()
  })

  it('deletes from the detail dialog: closes it, confirms, then sends the delete', async () => {
    remove.mockReset().mockResolvedValue(undefined)
    render(<TransactionsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Lunch, Food. View details' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Lunch' })).getByRole('button', { name: 'Delete' }))
    await screen.findByRole('alertdialog', { name: 'Delete this transaction?' })
    fireEvent.click(screen.getByText('Remove'))
    await waitFor(() => expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'one' })))
  })
})

it('shows no clock time on an imported row: it would be the import’s, not the spend’s', () => {
  page.extra = [{ id: 'imp', version: 0, timestamp: '2026-09-18T04:20:00', date: '2026-09-18', item: 'FreshMart', amount_inr: '80', category: 'Groceries', source: 'import' }]
  render(<TransactionsView />)
  expect(screen.getByText('Groceries', { selector: '.txn-timeline-meta, .txn-timeline-meta *' })).toBeInTheDocument()
  expect(screen.queryByText(/4:20/)).toBeNull()
  page.extra = []
})

describe('who logged what', () => {
  const members = [
    { userId: 'u1', name: 'Priya Shah', avatarUrl: null, role: 'owner', joinedAt: null },
    { userId: 'u2', name: 'Rahul Rao', avatarUrl: null, role: 'member', joinedAt: '2026-10-12' },
  ]
  const shared = { multi: true, shared: true, readOnly: false, active: { id: 's1', name: 'Home', emoji: '🏠', role: 'member', ownerId: 'u1', members } }
  beforeEach(() => {
    feedMocks.user = { _id: 'u2' } as typeof feedMocks.user
    page.extra = [{ id: 'two', version: 0, timestamp: '2026-09-18T12:00:00', date: '2026-09-18', item: 'Taxi', amount_inr: '50', category: 'Travel', created_by: 'u2' }]
  })
  afterEach(() => {
    feedMocks.user = {}
    page.extra = []
    spaceMocks.value = { multi: false, budgets: [] }
  })

  it('changes nothing in a one-person budget', () => {
    render(<TransactionsView />)
    expect(screen.queryByRole('tab', { name: 'Mine' })).toBeNull()
    expect(screen.queryByRole('img', { name: /Added by/ })).toBeNull()
  })

  it('marks each row with who added it, the owner for rows with no author', () => {
    spaceMocks.value = shared
    render(<TransactionsView />)
    expect(screen.getByRole('img', { name: 'Added by Priya' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Added by you' })).toBeInTheDocument()
  })

  it('Mine shows only your rows; Everyone brings the rest back', async () => {
    spaceMocks.value = shared
    render(<TransactionsView />)
    expect(screen.getByRole('tab', { name: 'Everyone' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Mine' }))
    expect(screen.getByText('Taxi')).toBeInTheDocument()
    // The row animates out.
    await waitFor(() => expect(screen.queryByText('Lunch')).toBeNull())
    fireEvent.click(screen.getByRole('tab', { name: 'Everyone' }))
    expect(screen.getByText('Lunch')).toBeInTheDocument()
  })

  it('hides Log expense in a read-only budget', () => {
    spaceMocks.value = { ...shared, readOnly: true }
    render(<TransactionsView />)
    expect(screen.queryByRole('button', { name: 'Log expense' })).toBeNull()
  })
})
