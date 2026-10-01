import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TransactionEditModal } from './TransactionEditModal'
import { updateExpense } from '../api/expenses'
import { ExpenseWriteError } from '../lib/expenseConflict'
import type { ExpenseRow } from '../types'
vi.mock('../api/expenses', () => ({ updateExpense: vi.fn(), addExpense: vi.fn(), deleteExpense: vi.fn() }))
vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ currencySymbol: '₹' }) }))
vi.mock('./CategoryPicker', () => ({ CategoryPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <input aria-label="Category" value={value} onChange={(e) => onChange(e.target.value)} /> }))
vi.mock('./DatePicker', () => ({ DatePicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <input aria-label="Date" value={value} onChange={(e) => onChange(e.target.value)} /> }))
function setup() {
  vi.mocked(updateExpense).mockReset()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><TransactionEditModal id="id1" version={0} timestamp="ts" item="Lunch" amountInr={100} date="2026-09-18" category="Food" onClose={vi.fn()} onSaved={vi.fn()} /></QueryClientProvider>)
}
describe('conflicting transaction drafts', () => {
  it('preserves the draft and rebases only changed fields after explicit review', async () => {
    setup()
    vi.mocked(updateExpense).mockRejectedValueOnce(new ExpenseWriteError(409, 'Changed on another device', { id: 'id1', version: 1, item: 'Lunch', amount_inr: '150', category: 'Food', date: '2026-09-18' } as ExpenseRow)).mockResolvedValueOnce(undefined)
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Travel' } })
    fireEvent.click(screen.getByText('Save changes'))
    await screen.findByText('This transaction was updated')
    expect(screen.getByText('Travel')).toBeInTheDocument()
    expect(screen.queryByText('Changed on another device')).not.toBeInTheDocument()
    expect(screen.queryByText('Save changes')).not.toBeInTheDocument()
    expect(updateExpense).toHaveBeenLastCalledWith('id1', 'ts', 'Lunch', 100, { category: 'Travel' }, 0)
    fireEvent.click(screen.getByText('Continue with my changes'))
    expect(screen.getByLabelText('Amount (₹)')).toHaveValue(150)
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() => expect(updateExpense).toHaveBeenLastCalledWith('id1', 'ts', 'Lunch', 100, { category: 'Travel' }, 1))
  })
  it('can use the latest values without saving or retaining discarded edits', async () => {
    setup()
    vi.mocked(updateExpense).mockRejectedValueOnce(new ExpenseWriteError(409, 'Changed on another device', { id: 'id1', version: 2, item: 'Lunch', amount_inr: '150', category: 'Food', date: '2026-09-18' } as ExpenseRow)).mockResolvedValueOnce(undefined)
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Dinner' } })
    fireEvent.click(screen.getByText('Save changes'))
    await screen.findByText('This transaction was updated')
    await waitFor(() => expect(screen.getByRole('region', { name: 'This transaction was updated' })).toHaveFocus())
    expect(screen.queryByText('Date')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Use latest instead'))
    expect(screen.getByLabelText('Description')).toHaveValue('Lunch')
    expect(screen.getByLabelText('Amount (₹)')).toHaveValue(150)
    expect(updateExpense).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Coffee' } })
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() => expect(updateExpense).toHaveBeenLastCalledWith('id1', 'ts', 'Lunch', 100, { new_item: 'Coffee' }, 2))
  })
  it('keeps the draft visible when the transaction was deleted', async () => {
    setup()
    vi.mocked(updateExpense).mockRejectedValueOnce(new ExpenseWriteError(404, 'This transaction was deleted on another device.'))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Dinner' } })
    fireEvent.click(screen.getByText('Save changes'))
    await screen.findByRole('dialog', { name: 'This transaction is already deleted' })
    expect(screen.queryByText('This transaction was deleted on another device.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Back to my draft'))
    expect(screen.getByLabelText('Description')).toHaveValue('Dinner')
    expect(screen.getByText('Save changes').closest('button')).toBeDisabled()
  })
})
