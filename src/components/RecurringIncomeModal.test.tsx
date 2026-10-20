import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RecurringIncomeModal } from './RecurringIncomeModal'

const { mutation } = vi.hoisted(() => ({ mutation: { isPending: false, mutateAsync: vi.fn() } }))

vi.mock('../hooks/useIncomes', () => ({
  useRecurringIncomes: () => ({ data: [] }),
  useAddRecurringIncome: () => mutation,
  useUpdateRecurringIncome: () => mutation,
  useDeleteRecurringIncome: () => mutation,
}))
vi.mock('../hooks/useAccounts', () => ({ useAccounts: () => ({ data: [] }), liveAccounts: () => [] }))
vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ currencySymbol: '₹' }) }))
vi.mock('./DatePicker', () => ({ DatePicker: () => null }))
vi.mock('../hooks/useSpaces', () => ({
  useSpaces: () => ({
    active: { id: 's1', name: 'Home', role: 'member', ownerId: 'u1', members: [{ userId: 'u1', name: 'Priya Shah' }, { userId: 'u2', name: 'Rahul' }] },
  }),
}))

it("a member in a lapsed budget hears it's read-only, not to check their connection", async () => {
  mutation.mutateAsync.mockRejectedValue(Object.assign(new Error('402'), { status: 402 }))
  render(<RecurringIncomeModal initial={{ label: 'Salary', amount: '50000' }} onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add income' }))
  expect(await screen.findByText("This budget is read-only until Priya renews. Your data's safe, and export's always free.")).toBeTruthy()
})
