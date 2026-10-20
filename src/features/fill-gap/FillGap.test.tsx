import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

let lastSpent: Record<string, string> | undefined
const mutateAsync = vi.fn()
vi.mock('@/src/hooks/useExpenses', () => ({ useLastSpent: () => ({ data: lastSpent }), useAddExpense: () => ({ mutateAsync }) }))
vi.mock('@/src/hooks/useBillingStatus', () => ({ useAccessAllowed: () => true }))
vi.mock('@/src/lib/date', () => ({ todayLocal: () => '2026-10-19' }))
vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ currencySymbol: '₹' }) }))
vi.mock('@/src/components/LogExpenseModal', () => ({ LogExpenseModal: ({ onBack }: { onBack: () => void }) => <button type="button" onClick={onBack}>log-expense-dialog</button> }))
vi.mock('./StatementModal', () => ({ StatementModal: ({ onClose }: { onClose: () => void }) => <button type="button" onClick={onClose}>statement-dialog</button> }))
vi.mock('@/src/components/CategoryPicker', () => ({
  CategoryPicker: ({ onChange }: { onChange: (c: string) => void }) => <button type="button" onClick={() => onChange('Food')}>Food</button>,
}))

const { FillGap } = await import('./FillGap')

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  lastSpent = { Food: '2026-10-15', Travel: '2026-10-02' }
  mutateAsync.mockResolvedValue({})
})

describe('FillGap', () => {
  it('offers the three ways to catch up after two days away, upload first, with no corner close', () => {
    render(<FillGap />)
    expect(screen.getByText('Pick up where you left off')).toBeTruthy()
    const labels = screen.getAllByRole('button').map((b) => b.textContent)
    expect(labels[0]).toContain('Upload a screenshot or statement')
    expect(labels[0]).toContain('You tick what\'s right')
    expect(labels[1]).toContain('Type what you remember')
    expect(labels[2]).toContain('Start fresh')
    expect(screen.queryByLabelText('Close')).toBeNull()
  })

  it('says nothing when something was logged yesterday', () => {
    lastSpent = { Food: '2026-10-18' }
    render(<FillGap />)
    expect(screen.queryByText('Pick up where you left off')).toBeNull()
  })

  it('shows once per gap: Not now holds until a newer expense', async () => {
    const { unmount } = render(<FillGap />)
    fireEvent.click(screen.getByText('Not now'))
    await waitFor(() => expect(screen.queryByText('Pick up where you left off')).toBeNull())
    unmount()
    render(<FillGap />)
    expect(screen.queryByText('Pick up where you left off')).toBeNull()
  })

  it('comes back for a newer gap without a reload, even after an option was used', async () => {
    const { rerender } = render(<FillGap />)
    fireEvent.click(screen.getByText('Upload a screenshot or statement'))
    fireEvent.click(await screen.findByText('statement-dialog'))
    await waitFor(() => expect(screen.queryByText('Pick up where you left off')).toBeNull())
    lastSpent = { Food: '2026-10-17' }
    rerender(<FillGap />)
    expect(await screen.findByText('Pick up where you left off')).toBeTruthy()
  })

  it('goes back to the sheet from an option, so another can be picked', async () => {
    render(<FillGap />)
    fireEvent.click(screen.getByText('Type what you remember'))
    fireEvent.click(await screen.findByText('log-expense-dialog'))
    fireEvent.click(await screen.findByText('Start fresh'))
    expect(await screen.findByText('Roughly how much did you spend while away?')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Back'))
    expect(await screen.findByText('Pick up where you left off')).toBeTruthy()
  })

  it('opens the upload from the sheet', async () => {
    render(<FillGap />)
    fireEvent.click(screen.getByText('Upload a screenshot or statement'))
    expect(await screen.findByText('statement-dialog')).toBeTruthy()
  })

  it('starts fresh with one Untracked spending expense today', async () => {
    render(<FillGap />)
    fireEvent.click(screen.getByText('Start fresh'))
    fireEvent.change(await screen.findByLabelText('Rough total'), { target: { value: '3500' } })
    fireEvent.click(screen.getByText('Food'))
    fireEvent.click(screen.getByText('Log it'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      item: 'Untracked spending', amount_inr: '3500', category: 'Food', date: '2026-10-19', source: 'fresh_start', client_id: 'fresh:2026-10-15',
    })))
  })

  it('"No idea" just closes, logging nothing', async () => {
    render(<FillGap />)
    fireEvent.click(screen.getByText('Start fresh'))
    fireEvent.click(await screen.findByText('No idea'))
    await waitFor(() => expect(screen.queryByText('Roughly how much did you spend while away?')).toBeNull())
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
