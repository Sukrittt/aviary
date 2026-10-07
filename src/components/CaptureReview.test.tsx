import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CaptureProposal } from '@/src/api/ai'
import { GAP_ORIGIN } from '@/src/features/capture/captureRows'
import { CaptureReview } from './CaptureReview'

const mocks = vi.hoisted(() => ({ add: vi.fn(), track: vi.fn() }))
vi.mock('@/src/hooks/useExpenses', () => ({
  useRecentExpenses: () => ({ data: [] }),
  useAddExpense: () => ({ mutateAsync: mocks.add }),
}))
vi.mock('@/src/hooks/useCategories', () => ({
  useCategories: () => ({ data: [{ name: 'Travel', group: 'Everyday' }, { name: 'Food', group: 'Everyday' }, { name: 'Sports', group: 'Fun' }] }),
}))
vi.mock('@/src/lib/analytics', () => ({ track: mocks.track }))
vi.mock('@/src/lib/date', () => ({ todayIST: () => '2026-10-07' }))

const proposal: CaptureProposal = {
  id: 'p1',
  items: [
    { id: 'r1', item: 'Auto', amount: 240, splitWays: 1, date: '2026-10-07', category: 'Travel', categoryConfidence: 1 },
    { id: 'r2', item: 'Turf', amount: 1200, splitWays: 6, date: '2026-10-07', category: 'Sports', categoryConfidence: 0.9 },
  ],
  skipped: [],
  unparsed: [],
}

function show(props: Partial<Parameters<typeof CaptureReview>[0]> = {}) {
  const onSettled = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CaptureReview proposal={proposal} onSettled={onSettled} {...props} />
    </QueryClientProvider>,
  )
  return onSettled
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.add.mockImplementation(async (row: { client_id: string }) => ({ id: `e-${row.client_id}`, clientId: row.client_id, pending: false }))
})

it('logs every kept row with a client_id fixed by the proposal, then shows what was logged', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const onSettled = show()
  expect(screen.getByText('₹1,200 ÷ 6 = ₹200')).toBeInTheDocument()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Log 2 spends' }))
  })

  expect(mocks.add).toHaveBeenNthCalledWith(1, expect.objectContaining({ item: 'Auto', amount_inr: '240', source: 'text', client_id: 'capture:p1:r1' }))
  expect(mocks.add).toHaveBeenNthCalledWith(2, expect.objectContaining({ item: 'Turf', amount_inr: '200', client_id: 'capture:p1:r2', notes: 'Split 6 ways · ₹1,200 total' }))
  expect(onSettled).toHaveBeenCalledWith('submitted', ['e-capture:p1:r1', 'e-capture:p1:r2'])
  expect(mocks.track).toHaveBeenCalledWith('capture_logged', expect.objectContaining({ source: 'text', rows: 2, edited: 0, removed: 0 }))
  await act(async () => {
    vi.advanceTimersByTime(1100)
  })
  expect(screen.getByTestId('capture-summary')).toHaveTextContent('Logged 2 spends · ₹440')
  vi.useRealTimers()
})

it('logs only what is left after an edit and a removal', async () => {
  show()
  fireEvent.change(screen.getByRole('textbox', { name: 'Amount for Auto' }), { target: { value: '260' } })
  fireEvent.click(screen.getByRole('button', { name: 'Remove Turf' }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Log 1 spend' }))
  })
  expect(mocks.add).toHaveBeenCalledTimes(1)
  expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ amount_inr: '260' }))
  expect(mocks.track).toHaveBeenCalledWith('capture_logged', expect.objectContaining({ rows: 1, edited: 1, removed: 1 }))
})

it('waits for an envelope on a row the money brain was unsure of', () => {
  show({ proposal: { ...proposal, items: [{ ...proposal.items[0], category: '' }] } })
  expect(screen.getByRole('button', { name: 'Log 1 spend' })).toBeDisabled()
  expect(screen.getByRole('combobox', { name: 'Pick an envelope' })).toBeInTheDocument()
})

it('keeps rows that failed editable, with a written message, and a retry skips the ones that made it', async () => {
  mocks.add.mockImplementationOnce(async () => ({ id: 'e1', clientId: 'capture:p1:r1', pending: false })).mockRejectedValueOnce(new Error('Failed to add expense: 503'))
  show()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Log 2 spends' }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent("Couldn't log 1 spend. Check your connection and try again.")
  expect(screen.queryByText(/503/)).toBeNull()
  expect(screen.getByRole('textbox', { name: 'What you paid for' })).toHaveValue('Turf')

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Log 1 spend' }))
  })
  expect(mocks.add).toHaveBeenLastCalledWith(expect.objectContaining({ client_id: 'capture:p1:r2' }))
})

it('logs a balance check estimate as one', async () => {
  show({ origin: GAP_ORIGIN, proposal: { ...proposal, items: [{ ...proposal.items[0], item: 'Unlogged spends', paymentMethod: 'bank' }] } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Log 1 spend' }))
  })
  expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ source: 'balance_gap', client_id: 'gap:p1:r1', notes: 'Estimated from a balance check', payment_method: 'bank' }))
})

it('dismisses without logging', async () => {
  const onSettled = show()
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
  await waitFor(() => expect(screen.getByTestId('capture-summary')).toHaveTextContent('Not logged'))
  expect(mocks.add).not.toHaveBeenCalled()
  expect(onSettled).toHaveBeenCalledWith('dismissed', [])
})

it('shows a settled proposal read-only', () => {
  show({ proposal: { ...proposal, status: 'submitted', expenseIds: ['e1', 'e2'] } })
  expect(screen.getByTestId('capture-summary')).toHaveTextContent('Logged 2 spends')
  expect(screen.queryByRole('button', { name: /Log/ })).toBeNull()
})
