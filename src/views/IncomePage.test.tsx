import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { IncomePage } from './IncomePage'
import { AccountsPage } from './AccountsPage'
import * as incomesApi from '@/src/api/incomes'
import * as accountsApi from '@/src/api/accounts'
import { currentMonthKey } from '@/src/lib/envelope'

vi.mock('@/src/api/incomes', async (original) => ({
  ...(await original<typeof import('@/src/api/incomes')>()),
  getIncomes: vi.fn(),
  getRecurringIncomes: vi.fn(),
  deleteIncome: vi.fn(),
  addRecurringIncome: vi.fn(),
}))
vi.mock('@/src/api/accounts', async (original) => ({
  ...(await original<typeof import('@/src/api/accounts')>()),
  getAccounts: vi.fn(),
  addAccount: vi.fn(),
  updateAccount: vi.fn(),
}))
vi.mock('@/src/api/balanceChecks', () => ({ getBalanceStatus: vi.fn(async () => ({ accounts: ['HDFC', 'Slice'] })) }))
vi.mock('@/src/api/budgets', () => ({ getBudgets: vi.fn(async () => []) }))
vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ currencySymbol: '₹', formatCurrency: (n: number) => `₹${n}` }) }))
vi.mock('../hooks/useHideAmounts', () => ({ useHideAmounts: () => [false] }))

function renderPage(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(node, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}

const month = currentMonthKey()

beforeEach(() => {
  vi.mocked(accountsApi.getAccounts).mockResolvedValue([])
  vi.mocked(incomesApi.getIncomes).mockResolvedValue([])
  vi.mocked(incomesApi.getRecurringIncomes).mockResolvedValue([])
})

describe('IncomePage', () => {
  it('shows what comes in on repeat and what was recorded this month', async () => {
    vi.mocked(incomesApi.getRecurringIncomes).mockResolvedValue([
      { id: 'r1', label: 'Salary', amount: '50000', frequency: 'monthly', start_date: `${month}-01`, end_date: '', next_run_date: '2099-01-01', account_id: '', status: 'active', created_at: '' },
    ])
    vi.mocked(incomesApi.getIncomes).mockResolvedValue([
      { id: 'i1', version: 0, date: `${month}-02`, amount: '1500', label: 'Freelance', notes: '', account_id: '', recurring_id: '', source: 'manual', counted: 'extra', created_at: '' },
    ])
    renderPage(<IncomePage />)
    expect(await screen.findByText('Salary')).toBeInTheDocument()
    expect(screen.getByText('Every month')).toBeInTheDocument()
    expect(screen.getByText('Freelance')).toBeInTheDocument()
    expect(screen.getByText(/Added by you/)).toBeInTheDocument()
  })

  it('deletes a recorded income after a confirm', async () => {
    vi.mocked(incomesApi.getIncomes).mockResolvedValue([
      { id: 'i1', version: 2, date: `${month}-02`, amount: '1500', label: 'Freelance', notes: '', account_id: '', recurring_id: '', source: 'manual', counted: 'extra', created_at: '' },
    ])
    vi.mocked(incomesApi.deleteIncome).mockResolvedValue()
    renderPage(<IncomePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Freelance' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(incomesApi.deleteIncome).toHaveBeenCalledWith('i1', 2))
  })

  it('invites a first income when there is none', async () => {
    renderPage(<IncomePage />)
    expect(await screen.findByText('What comes in?')).toBeInTheDocument()
  })
})

describe('AccountsPage', () => {
  it('offers the balance check names, cash and a card on first visit', async () => {
    vi.mocked(accountsApi.addAccount).mockResolvedValue({ id: 'x' })
    renderPage(<AccountsPage />)
    expect(await screen.findByText('Start with these?')).toBeInTheDocument()
    await screen.findByRole('button', { name: /HDFC/ })
    fireEvent.click(screen.getByRole('button', { name: /Credit card/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add these 4' }))
    await waitFor(() => expect(accountsApi.addAccount).toHaveBeenCalledTimes(4))
    expect(vi.mocked(accountsApi.addAccount).mock.calls.map((c) => c[0])).toEqual([
      { name: 'HDFC', type: 'bank' },
      { name: 'Slice', type: 'bank' },
      { name: 'Cash', type: 'cash' },
      { name: 'Credit card', type: 'credit_card' },
    ])
  })

  it('lists live accounts and restores an archived one', async () => {
    vi.mocked(accountsApi.getAccounts).mockResolvedValue([
      { id: 'a1', name: 'HDFC', type: 'bank', archived: false, created_at: '1' },
      { id: 'a2', name: 'Old card', type: 'credit_card', archived: true, created_at: '2' },
    ])
    vi.mocked(accountsApi.updateAccount).mockResolvedValue()
    renderPage(<AccountsPage />)
    expect(await screen.findByText('Bank account')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(accountsApi.updateAccount).toHaveBeenCalledWith('a2', { archived: false }))
  })
})
