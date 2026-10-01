import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { RecurringPage, dueLabel, monthlyEquivalent } from './RecurringPage'
import { getRecurringExpenses } from '@/src/api/recurringExpenses'
import { toISTDateString } from '@/src/lib/date'
import type { RecurringExpenseRow } from '@/src/types'

vi.mock('@/src/api/recurringExpenses', () => ({
  getRecurringExpenses: vi.fn(),
  addRecurringExpense: vi.fn(),
  updateRecurringExpense: vi.fn(),
  pauseRecurringExpense: vi.fn(),
  resumeRecurringExpense: vi.fn(),
  deleteRecurringExpense: vi.fn(),
}))

function row(overrides: Partial<RecurringExpenseRow>): RecurringExpenseRow {
  return {
    id: 'r1',
    item: 'Rent',
    amount_inr: '1200',
    category: '🏠 Rent',
    notes: '',
    payment_method: 'bank',
    frequency: 'monthly',
    start_date: '2026-01-01',
    end_date: '',
    next_run_date: '2026-10-01',
    status: 'active',
    created_at: '',
    ...overrides,
  }
}

describe('monthlyEquivalent', () => {
  it('normalises every cadence to a month', () => {
    expect(monthlyEquivalent(row({ frequency: 'monthly', amount_inr: '1200' }))).toBe(1200)
    expect(monthlyEquivalent(row({ frequency: 'yearly', amount_inr: '1200' }))).toBe(100)
    expect(monthlyEquivalent(row({ frequency: 'weekly', amount_inr: '120' }))).toBe(520)
    expect(monthlyEquivalent(row({ frequency: 'daily', amount_inr: '10' }))).toBe(300)
  })

  it('treats an unparseable amount as nothing rather than NaN', () => {
    expect(monthlyEquivalent(row({ amount_inr: 'abc' }))).toBe(0)
  })
})

describe('dueLabel', () => {
  it('reads today and tomorrow in IST, and a date otherwise', () => {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(dueLabel(toISTDateString(today))).toBe('Due today')
    expect(dueLabel(toISTDateString(tomorrow))).toBe('Due tomorrow')
    expect(dueLabel('2099-03-14')).toBe('Next on 14 Mar')
    expect(dueLabel('')).toBe('Not scheduled')
  })
})

describe('RecurringPage', () => {
  it('totals only active rows and files paused ones separately', async () => {
    ;(getRecurringExpenses as Mock).mockResolvedValue([
      row({ id: 'a', item: 'Rent', amount_inr: '1200' }),
      row({ id: 'b', item: 'Gym', amount_inr: '1200', frequency: 'yearly', category: 'Health' }),
      row({ id: 'c', item: 'Maid', amount_inr: '5000', status: 'paused' }),
    ])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<RecurringPage />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    })

    expect(await screen.findByLabelText('₹1,300')).toBeInTheDocument()
    expect(screen.getByText('2 active')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Paused and finished' })).toHaveTextContent('Maid')
    expect(screen.getByRole('list', { name: 'Paused and finished' })).toHaveTextContent('Paused')
  })
})
