import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AddIncomeScreen, AssignMoneyScreen, EditAssignedScreen, EditMonthIncomeScreen, EditReadyToAssignScreen, MoveMoneyScreen } from './MoneyScreens'
import userEvent from '@testing-library/user-event'
import { currentMonthKey } from '../lib/envelope'
import { BudgetWriteError } from '../lib/budgetConflict'

const mocks = vi.hoisted(() => ({ fresh: vi.fn(), update: vi.fn(), add: vi.fn(), transfer: vi.fn(), addIncome: vi.fn(), updateIncome: vi.fn(), budgetsLoading: false, accounts: [] as { id: string; name: string; type: string; archived: boolean; created_at: string }[], budgets: [] as {month: string; category: string; assigned: string; rolled_over: string; extra?: string; version: number}[] }))
vi.mock('../hooks/useBudgets', () => ({
  useBudgets: () => (mocks.budgetsLoading ? { data: undefined, isLoading: true } : { data: mocks.budgets }),
  useFreshBudgets: () => mocks.fresh,
  useUpdateBudget: () => ({ mutateAsync: mocks.update }),
  useAddBudget: () => ({ mutateAsync: mocks.add }),
  useTransferBudget: () => ({ mutateAsync: mocks.transfer }),
}))
vi.mock('../hooks/useExpenses', () => ({ useRecentExpenses: () => ({ data: [] }) }))
vi.mock('../hooks/useCategories', () => ({ useCategories: () => ({ data: [{ name: 'Food', group: 'Home' }, { name: 'Rent', group: 'Home' }] }) }))
vi.mock('../hooks/useGroups', () => ({ useGroups: () => ({ data: ['Home'] }) }))
vi.mock('../hooks/useHideAmounts', () => ({ useHideAmounts: () => [false] }))
vi.mock('../hooks/useIncomes', () => ({ useAddIncome: () => ({ mutateAsync: mocks.addIncome }), useUpdateIncome: () => ({ mutateAsync: mocks.updateIncome }) }))
vi.mock('../hooks/useAccounts', () => ({ useAccounts: () => ({ data: mocks.accounts }), liveAccounts: (rows: { archived: boolean }[]) => rows.filter((a) => !a.archived) }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.update.mockResolvedValue(undefined)
  mocks.fresh.mockImplementation(async () => mocks.budgets)
  mocks.add.mockResolvedValue(undefined)
  mocks.transfer.mockResolvedValue(undefined)
  mocks.addIncome.mockResolvedValue({ id: 'i1' })
  mocks.updateIncome.mockResolvedValue(2)
  mocks.accounts = []
  mocks.budgetsLoading = false
  mocks.budgets = [['__income__', '2000'], ['Food', '100'], ['Rent', '500']].map(([category, assigned]) => ({ month: currentMonthKey(), category, assigned, rolled_over: '0', version: 3 }))
})

function typeAmount(value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), { target: { value } })
}
function openSources(value: string) {
  render(<MoveMoneyScreen targetCategory="Food" onClose={vi.fn()} />)
  typeAmount(value)
  fireEvent.click(screen.getByRole('button', { name: 'Pick sources →' }))
}

describe('money screens', () => {
  it.each([
    ['move', () => <MoveMoneyScreen targetCategory="Food" onClose={vi.fn()} />],
    ['assign', () => <AssignMoneyScreen category="Food" onClose={vi.fn()} />],
    ['edit', () => <EditAssignedScreen category="Food" onClose={vi.fn()} />],
    ['ready', () => <EditReadyToAssignScreen onClose={vi.fn()} />],
  ] as const)('%s uses an editable amount field without a numpad', (_name, create) => {
    render(create())
    expect(screen.getByRole('textbox', { name: 'Amount' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1' })).not.toBeInTheDocument()
    typeAmount('123.45')
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('123.45')
  })

  it('submits a decimal transfer from multiple sources exactly', async () => {
    openSources('1500.25')
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }))
    fireEvent.click(screen.getByRole('button', { name: /^Move ₹/ }))
    await waitFor(() => expect(mocks.transfer).toHaveBeenCalledWith({ month: currentMonthKey(), to: 'Food', sources: [
      { category: '__ready_to_assign__', amount: 1400 }, { category: 'Rent', amount: 100.25 },
    ] }))
  })

  it('hides the other sources once the transfer is fully covered', async () => {
    openSources('100')
    fireEvent.click(screen.getByRole('button', { name: /Ready to Assign.*AVAILABLE/ }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Rent.*AVAILABLE/ })).not.toBeInTheDocument())
    expect(screen.getByText(/You're all covered/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByRole('button', { name: /Rent.*AVAILABLE/ })).toBeInTheDocument()
  })

  it('preserves cents when editing a source allocation', async () => {
    openSources('100.25')
    fireEvent.click(screen.getByRole('button', { name: /Ready to Assign.*AVAILABLE/ }))
    fireEvent.change(screen.getByLabelText('Amount from Ready to Assign'), { target: { value: '50.25' } })
    expect(screen.getByLabelText('Amount from Ready to Assign')).toHaveValue('50.25')
    fireEvent.change(screen.getByLabelText('Amount from Ready to Assign'), { target: { value: '100.25' } })
    fireEvent.click(screen.getByRole('button', { name: /^Move ₹/ }))
    await waitFor(() => expect(mocks.transfer).toHaveBeenCalled())
  })

  it('allows typing a decimal source amount character by character', async () => {
    const user = userEvent.setup()
    openSources('100.25')
    fireEvent.click(screen.getByRole('button', { name: /Ready to Assign.*AVAILABLE/ }))
    const input = screen.getByLabelText('Amount from Ready to Assign')
    await user.clear(input)
    await user.type(input, '50.25')
    expect(input).toHaveValue('50.25')
  })

  it('shows the money freed when an assignment is cleared', async () => {
    render(<EditAssignedScreen category="Food" onClose={vi.fn()} />)
    typeAmount('')
    expect(screen.getByText(/Frees ₹100 back to Ready to Assign/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ month: currentMonthKey(), category: 'Food', version: 3, updates: { assigned: '0' } }))
  })

  it('saves the difference as this month\'s income extra, leaving the monthly income alone', async () => {
    render(<EditReadyToAssignScreen onClose={vi.fn()} />)
    typeAmount('')
    typeAmount('99.99')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ month: currentMonthKey(), category: '__income__', version: 3, updates: { extra: '-1300.01' } }))
  })

  it('derives the extra from the envelopes as they are at save time, not as they were when opened', async () => {
    render(<EditReadyToAssignScreen onClose={vi.fn()} />)
    typeAmount('99.99')
    // Another device assigned 200 more to Food after this editor opened.
    mocks.fresh.mockResolvedValue(mocks.budgets.map((b) => (b.category === 'Food' ? { ...b, assigned: '300' } : b)))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ month: currentMonthKey(), category: '__income__', version: 3, updates: { extra: '-1100.01' } }))
  })

  it('records a one-off in the income ledger, which moves Ready to Assign server-side', async () => {
    const onClose = vi.fn()
    render(<AddIncomeScreen onClose={onClose} />)
    typeAmount('10000')
    fireEvent.change(screen.getByRole('textbox', { name: /What was it/ }), { target: { value: 'Diwali bonus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }))
    await waitFor(() => expect(mocks.addIncome).toHaveBeenCalledWith(expect.objectContaining({ amount: 10000, label: 'Diwali bonus', client_id: expect.any(String) })))
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('lets you type a one-off before the budget data has loaded', async () => {
    mocks.budgetsLoading = true
    render(<AddIncomeScreen onClose={vi.fn()} />)
    typeAmount('300')
    expect(screen.getByText('Adds to Ready to Assign · This month only')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }))
    await waitFor(() => expect(mocks.addIncome).toHaveBeenCalledWith(expect.objectContaining({ amount: 300 })))
  })

  it('edits an income row in place, keeping its name when the field is cleared', async () => {
    const row = { id: 'r1', version: 4, date: `${currentMonthKey()}-05`, amount: '1000', label: 'Bonus', notes: '', account_id: '', recurring_id: '', source: 'manual', counted: 'extra', created_at: '' }
    render(<AddIncomeScreen existing={row} onClose={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('1000')
    typeAmount('1500')
    fireEvent.change(screen.getByRole('textbox', { name: /What was it/ }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mocks.updateIncome).toHaveBeenCalledWith({ id: 'r1', version: 4, updates: { amount: 1500, label: 'Bonus' } }))
    expect(mocks.addIncome).not.toHaveBeenCalled()
  })

  it('names an unnamed one-off and offers accounts once there are some', async () => {
    mocks.accounts = [{ id: 'a1', name: 'HDFC', type: 'bank', archived: false, created_at: '' }]
    render(<AddIncomeScreen onClose={vi.fn()} />)
    typeAmount('500')
    fireEvent.click(screen.getByRole('radio', { name: /HDFC/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }))
    await waitFor(() => expect(mocks.addIncome).toHaveBeenCalledWith(expect.objectContaining({ amount: 500, label: 'Extra income', account_id: 'a1' })))
  })

  it('keeps the screen open with a written error when saving fails', async () => {
    mocks.addIncome.mockRejectedValueOnce(new Error('503'))
    render(<AddIncomeScreen onClose={vi.fn()} />)
    typeAmount('500')
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save. Check your connection and try again.")
  })

  it('creates the income row for a past month that has none', async () => {
    render(<EditMonthIncomeScreen month="2026-07" onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    typeAmount('85000')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ month: '2026-07', category: '__income__', version: 0, updates: { assigned: '85000' } }))
  })

  it('updates an existing zero income row for that month with its version', async () => {
    mocks.budgets.push({ month: '2026-07', category: '__income__', assigned: '0', rolled_over: '0', version: 2 })
    render(<EditMonthIncomeScreen month="2026-07" onClose={vi.fn()} />)
    typeAmount('85000')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-07', version: 2 })))
  })

  it('assigns additional money through the atomic transfer API', async () => {
    render(<AssignMoneyScreen category="Food" onClose={vi.fn()} />)
    typeAmount('25.50')
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
    await waitFor(() => expect(mocks.transfer).toHaveBeenCalledWith({ month: currentMonthKey(), to: 'Food', sources: [{ category: '__ready_to_assign__', amount: 25.5 }] }))
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('prevents assigning more than Ready to Assign', () => {
    render(<AssignMoneyScreen category="Food" onClose={vi.fn()} />)
    typeAmount('1400.01')
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled()
  })

  it('locks the inputs and close action while saving', async () => {
    mocks.update.mockReturnValue(new Promise(() => {}))
    const close = vi.fn()
    render(<EditAssignedScreen category="Food" onClose={close} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: '₹500' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(close).not.toHaveBeenCalled()
  })

  it('keeps a failed save open and allows retry', async () => {
    const close = vi.fn()
    mocks.update.mockRejectedValueOnce(new Error('offline'))
    render(<EditAssignedScreen category="Food" onClose={close} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/Couldn't save/)
    expect(close).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2))
  })

  it('preserves a stale draft and requires a second save after rebasing it', async () => {
    mocks.update.mockRejectedValueOnce(new BudgetWriteError(409, 'changed', {
      month: currentMonthKey(), category: 'Food', assigned: '175', rolled_over: '0', version: 4,
    }))
    render(<EditAssignedScreen category="Food" onClose={vi.fn()} />)
    typeAmount('250')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('This assignment was updated')).toBeInTheDocument()
    expect(screen.getByText('₹175')).toBeInTheDocument()
    expect(screen.getByText('₹250')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Continue with my changes/ }))
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('250')
    expect(mocks.update).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.update).toHaveBeenLastCalledWith({
      month: currentMonthKey(), category: 'Food', version: 4, updates: { assigned: '250' },
    }))
  })
})
