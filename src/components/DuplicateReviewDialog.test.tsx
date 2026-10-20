import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ExpenseRow } from '../types'

const spaces = vi.hoisted(() => ({ readOnly: false }))
vi.mock('../hooks/useSpaces', () => ({ useSpaces: () => ({ readOnly: spaces.readOnly, active: undefined }) }))
vi.mock('../hooks/useExpenses', () => ({
  useDeleteExpense: () => ({ mutateAsync: vi.fn() }),
  useDismissDuplicate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ formatCurrency: (n: number) => `₹${n}` }) }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

const { DuplicateReviewDialog } = await import('./DuplicateReviewDialog')

const row = (id: number): ExpenseRow => ({ id, version: 1, item: 'Chai', amount_inr: '20', date: '2026-10-19', timestamp: '2026-10-19T09:00:00Z', category: 'Food' } as unknown as ExpenseRow)
const pairs = [{ duplicate: row(2), original: row(1) }]

describe('DuplicateReviewDialog', () => {
  it('offers delete and keep in a writable budget', () => {
    render(<DuplicateReviewDialog pairs={pairs} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Delete the newer one' })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the read-only notice instead of the actions in a read-only budget', () => {
    spaces.readOnly = true
    render(<DuplicateReviewDialog pairs={pairs} onClose={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('This budget is read-only')
    expect(screen.queryByRole('button', { name: 'Delete the newer one' })).toBeNull()
  })
})
