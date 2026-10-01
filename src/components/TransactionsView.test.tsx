import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import { TransactionsView } from './TransactionsView'
import { ExpenseWriteError } from '../lib/expenseConflict'
const { remove, dismiss, duplicates } = vi.hoisted(() => ({ remove: vi.fn(), dismiss: vi.fn(), duplicates: { data: [] as unknown[] } }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('../hooks/useBudgets', () => ({ useBudgets: () => ({ data: [{ category: 'Groceries' }] }) }))
vi.mock('../hooks/useCategories', () => ({ useCategories: () => ({ data: [{ name: 'Groceries' }, { name: 'Subscription' }] }) }))
vi.mock('../hooks/useRecentCategories', () => ({ useRecentCategories: () => ({ recents: [] }) }))
vi.mock('../hooks/useExpenses', () => ({
  useExpensesPage: () => ({ data: { rows: [{ id: 'one', version: 0, timestamp: '2026-09-18T10:00:00', date: '2026-09-18', item: 'Lunch', amount_inr: '100', category: 'Food' }], total: 1, pageCount: 1, totalAmount: 100 } }),
  useDeleteExpense: () => ({ mutateAsync: remove }),
  useDuplicates: () => duplicates,
  useDismissDuplicate: () => ({ mutateAsync: dismiss }),
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
