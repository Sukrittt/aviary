import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RecentActivity } from './RecentActivity'
import type { ExpenseRow } from '../types'
vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({
  formatCurrency: (amount: number, hidden: boolean) => hidden ? '---' : `₹${amount}`,
}) }))
it('shows the newest four expenses with date links and respects hidden amounts', () => {
  const expenses = [1, 4, 2, 5, 3].map((day) => ({
    id: String(day), date: `2026-09-0${day}`, timestamp: `2026-09-0${day}T10:00:00Z`,
    item: `Expense ${day}`, category: 'Food', amount_inr: '100',
  })) as ExpenseRow[]
  render(<RecentActivity expenses={expenses} hideAmounts />)
  const links = screen.getAllByRole('link').slice(1)
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/expense/transactions?date=2026-09-05', '/expense/transactions?date=2026-09-04',
    '/expense/transactions?date=2026-09-03', '/expense/transactions?date=2026-09-02',
  ])
  expect(screen.queryByText('Expense 1')).not.toBeInTheDocument()
  expect(screen.queryByText(/₹/)).not.toBeInTheDocument()
})
