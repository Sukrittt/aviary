import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecurringSuggestions } from './RecurringSuggestions'
import type { RecurringScan } from '../types/recurringSuggestions'
const mocks = vi.hoisted(() => ({ load: vi.fn(), scan: vi.fn(), dismiss: vi.fn(), hidden: [] as string[] }))
vi.mock('../hooks/useUser', () => ({ useHiddenFeatures: () => mocks.hidden }))
vi.mock('../hooks/useSpaces', () => ({ useSpaces: () => ({ readOnly: false, active: undefined }) }))
vi.mock('../api/recurringSuggestions', () => ({ loadRecurringSuggestions: mocks.load, scanRecurringSuggestions: mocks.scan, dismissRecurringSuggestion: mocks.dismiss }))
vi.mock('./RecurringExpenseModal', () => ({ RecurringExpenseModal: ({ initialValues, onClose, onAdded }: { initialValues: { item: string; start_date: string }; onClose: () => void; onAdded: () => void }) => <div role="dialog"><p>{initialValues.item} starts {initialValues.start_date}</p><button onClick={onClose}>Cancel review</button><button onClick={() => { onAdded(); onClose() }}>Confirm addition</button></div> }))
vi.mock('./SubscriptionModal', () => ({ SubscriptionModal: ({ initialValues, suggestionId, onClose }: { initialValues: { service: string; next_due_date: string }; suggestionId: string; onClose: () => void }) => <div role="dialog"><p>{initialValues.service} renews {initialValues.next_due_date}</p><p>Suggestion {suggestionId}</p><button onClick={onClose}>Cancel subscription review</button></div> }))
const empty: RecurringScan = { suggestions: [], remaining: 1, scannedAt: null, windowStart: '2026-03-22', windowEnd: '2026-09-22' }
const found: RecurringScan = { ...empty, remaining: 0, scannedAt: '2026-09-22T10:00:00Z', suggestions: [{ id: 's1', kind: 'other_recurring', dates: ['2026-07-05','2026-08-05','2026-09-05'], occurrences: 3, variableAmount: false, input: { item: 'Rent', amount_inr: '5000', category: 'Housing', frequency: 'monthly', start_date: '2026-10-05' } }] }
const subscriptionFound: RecurringScan = { ...found, suggestions: [{ ...found.suggestions[0], id: 'sub1', kind: 'subscription', input: { ...found.suggestions[0].input, item: 'Netflix', amount_inr: '649', category: 'Entertainment' } }] }
function mount(kind?: 'subscription' | 'other_recurring' | 'all') { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><RecurringSuggestions kind={kind} /></QueryClientProvider>) }
beforeEach(() => { vi.clearAllMocks(); mocks.hidden = []; mocks.load.mockResolvedValue(empty); mocks.scan.mockResolvedValue(found); mocks.dismiss.mockResolvedValue(undefined) })
it('loads saved results without scanning, then opens a prefilled review only after a click', async () => {
  mount()
  const button = screen.getByRole('button', { name: 'Find recurring expenses' })
  await waitFor(() => expect(button).toBeEnabled())
  expect(mocks.scan).not.toHaveBeenCalled()
  fireEvent.click(button)
  expect(await screen.findByText('Rent')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Review and add' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Rent starts 2026-10-05')
  fireEvent.click(screen.getByText('Cancel review'))
  expect(screen.getByText('Rent')).toBeInTheDocument()
  expect(mocks.dismiss).not.toHaveBeenCalled()
})
it('dismisses only when requested and removes the card', async () => {
  mocks.load.mockResolvedValue(found)
  mount()
  fireEvent.click(await screen.findByText('Dismiss'))
  await waitFor(() => expect(screen.queryByText('Rent')).not.toBeInTheDocument())
  expect(mocks.dismiss).toHaveBeenCalledWith('s1', expect.anything())
})
it('shows failures and keeps scanning available', async () => {
  mocks.scan.mockRejectedValue(new Error('Try again shortly'))
  mount()
  const button = screen.getByRole('button', { name: 'Find recurring expenses' })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
  expect(await screen.findByRole('alert')).toHaveTextContent('Try again shortly')
  expect(button).toBeEnabled()
})

it('selects shorter periods without calling Jev and submits the chosen period', async () => {
  mount()
  const selector = screen.getByRole('combobox', { name: 'Scan period' })
  await waitFor(() => expect(mocks.load).toHaveBeenCalledWith(6))
  const user = userEvent.setup()
  await user.click(selector)
  await user.click(await screen.findByRole('option', { name: 'Last month' }))
  expect(selector).toHaveTextContent('Last month')
  await waitFor(() => expect(mocks.load).toHaveBeenCalledWith(1))
  expect(mocks.scan).not.toHaveBeenCalled()
  const button = screen.getByRole('button', { name: 'Find recurring expenses' })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
  await waitFor(() => expect(mocks.scan).toHaveBeenCalledWith(1, expect.anything()))
})

it('shows scan loading phrases instead of saved results until scanning finishes', async () => {
  mocks.load.mockResolvedValue(found)
  let finish!: (value: RecurringScan) => void
  mocks.scan.mockImplementation(() => new Promise<RecurringScan>(resolve => { finish = resolve }))
  mount()
  await screen.findByText('Rent')
  fireEvent.click(screen.getByRole('button', { name: 'Find recurring expenses' }))
  expect(await screen.findByText('Looking for repeat payments…')).toBeInTheDocument()
  expect(screen.queryByText(/Last scanned/)).not.toBeInTheDocument()
  expect(screen.queryByText('Rent')).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Scan period' })).toBeDisabled()
  finish(found)
  expect(await screen.findByText('Rent')).toBeInTheDocument()
  expect(screen.queryByText('Looking for repeat payments…')).not.toBeInTheDocument()
})

it('filters subscription results and opens the subscription review form', async () => {
  mocks.load.mockResolvedValue(subscriptionFound)
  mount('subscription')
  await waitFor(() => expect(mocks.load).toHaveBeenCalledWith(12))
  expect(screen.getByRole('combobox', { name: 'Scan period' })).toHaveTextContent('Last 12 months')
  expect(await screen.findByText('Netflix')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Review and add' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Netflix renews 2026-10-05')
  expect(screen.getByRole('dialog')).toHaveTextContent('Suggestion sub1')
})

it('shows both kinds together for the import banner', async () => {
  mocks.load.mockResolvedValue({ ...found, suggestions: [...found.suggestions, ...subscriptionFound.suggestions] })
  mount('all')
  expect(await screen.findByText('Rent')).toBeInTheDocument()
  expect(screen.getByText('Netflix')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Find repeat payments' })).toBeInTheDocument()
})
it('sets a subscription up as a recurring expense when Subscriptions is switched off', async () => {
  mocks.hidden = ['subscriptions']
  mocks.load.mockResolvedValue(subscriptionFound)
  mount('all')
  fireEvent.click(await screen.findByRole('button', { name: 'Review and add' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Netflix starts 2026-10-05')
})
it('dates the last scan by the local day, not UTC', async () => {
  mocks.load.mockResolvedValue({ ...found, scannedAt: '2026-10-18T22:30:00Z' })
  mount()
  expect(await screen.findByRole('time')).toHaveAttribute('dateTime', '2026-10-19')
})
