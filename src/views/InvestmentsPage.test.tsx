import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteHolding, getHoldings, updateHolding } from '@/src/api/holdings'
import { getHoldingEvents } from '@/src/api/holdingEvents'
import { HoldingWriteError } from '@/src/lib/holdingConflict'
import type { HoldingRow } from '@/src/types'
import { HoldingModal, InvestmentsPage } from './InvestmentsPage'

vi.mock('@/src/api/holdings', () => ({
  getHoldings: vi.fn(),
  addHolding: vi.fn(),
  updateHolding: vi.fn(),
  deleteHolding: vi.fn(),
  performHoldingAction: vi.fn(),
}))
vi.mock('@/src/api/holdingEvents', () => ({ getHoldingEvents: vi.fn() }))

// The sidebar reads the WorkOS session, which drags @workos-inc/authkit-nextjs
// (and next/cache) into a jsdom run. It is chrome, not what this file tests.
vi.mock('../components/ExpenseSidebar', () => ({ ExpenseSidebar: () => null }))

function holding(overrides: Partial<HoldingRow> = {}): HoldingRow {
  return {
    name: 'Stocks',
    type: 'Equity',
    value: '1000',
    updated_at: '2026-09-23T00:00:00.000Z',
    is_recurring: 'true',
    recurring_amount: '100',
    recurring_day: '23',
    recurring_last_run: '',
    version: 4,
    ...overrides,
  }
}

function renderModal(row: HoldingRow) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <div className="expense-redesign">
      <HoldingModal name={row.name} holding={row} onClose={vi.fn()} />
    </div>,
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  )
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<InvestmentsPage />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

describe('InvestmentsPage deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getHoldings).mockResolvedValue([holding()])
    vi.mocked(getHoldingEvents).mockResolvedValue([])
    vi.mocked(deleteHolding).mockResolvedValue()
  })

  it('explains that a deleted holding can be restored from Archive', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /Stocks/ }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    const dialog = screen.getByRole('alertdialog', { name: 'Delete Stocks?' })
    expect(dialog).toHaveTextContent('It will move to Archive. You can restore it for 7 days.')
    expect(dialog).not.toHaveTextContent(/can't be undone/i)
  })
})

describe('HoldingModal concurrency review', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the draft, rebases to the latest version, and requires a second save', async () => {
    const latest = holding({ recurring_amount: '200', version: 5 })
    vi.mocked(updateHolding)
      .mockRejectedValueOnce(new HoldingWriteError(409, 'Holding changed', latest))
      .mockResolvedValueOnce()
    const user = userEvent.setup()

    renderModal(holding())
    const amount = screen.getByLabelText(/Monthly contribution/)
    fireEvent.change(amount, { target: { value: '150' } })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('This holding was updated')).toBeInTheDocument()
    expect(screen.getByText('₹200 monthly')).toBeInTheDocument()
    expect(screen.getByText('₹150 monthly')).toBeInTheDocument()
    expect(updateHolding).toHaveBeenCalledTimes(1)
    expect(updateHolding).toHaveBeenLastCalledWith(
      'Stocks',
      { is_recurring: true, recurring_amount: '150' },
      4,
    )

    await user.click(screen.getByRole('button', { name: /Continue with my changes/ }))
    expect(screen.getByLabelText(/Monthly contribution/)).toHaveValue(150)
    expect(updateHolding).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateHolding).toHaveBeenCalledTimes(2))
    expect(updateHolding).toHaveBeenLastCalledWith(
      'Stocks',
      { is_recurring: true, recurring_amount: '150' },
      5,
    )
  })
})
