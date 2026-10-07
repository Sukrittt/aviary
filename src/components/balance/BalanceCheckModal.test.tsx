import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CaptureProposal } from '@/src/api/ai'
import type { BalanceStatus } from '@/src/api/balanceChecks'
import type { RowOrigin } from '@/src/features/capture/captureRows'
import { BalanceCheckModal } from './BalanceCheckModal'

const mocks = vi.hoisted(() => ({ status: vi.fn(), submit: vi.fn(), resolve: vi.fn(), track: vi.fn() }))
vi.mock('@/src/api/balanceChecks', () => ({
  getBalanceStatus: () => mocks.status(),
  submitBalance: (...args: unknown[]) => mocks.submit(...args),
  resolveBalanceCheck: (...args: unknown[]) => mocks.resolve(...args),
}))
vi.mock('@/src/lib/analytics', () => ({ track: mocks.track }))
vi.mock('@/src/components/CaptureReview', () => ({
  CaptureReview: ({ proposal, origin, onSettled }: { proposal: CaptureProposal; origin: RowOrigin; onSettled: (s: string, ids: string[]) => void }) => (
    <button type="button" onClick={() => onSettled('submitted', ['e1'])}>
      {`Review ${proposal.items.map((i) => i.category).join(', ')} as ${origin.source}`}
    </button>
  ),
}))

const status = (over: Partial<BalanceStatus> = {}): BalanceStatus => ({
  due: true,
  open: false,
  expected: 48000,
  anchor: { timestamp: '2026-09-20T10:00:00+05:30', date: '2026-09-20', balance: 50000 },
  loggedPct: null,
  accounts: [],
  ...over,
})

const measured = (kind: 'square' | 'unlogged' | 'surplus', gap: number) => ({
  id: 'c2',
  kind,
  balance: 48000 - gap,
  expected: 48000,
  logged: 2000,
  gap,
  tolerance: 200,
  cardSpendRecent: 0,
  loggedPct: kind === 'square' ? 100 : null,
})

const estimate: CaptureProposal = {
  id: 'c2',
  items: [
    { id: 'g1', item: 'Unlogged spends', amount: 2000, splitWays: 1, date: '2026-10-07', category: 'Food', categoryConfidence: null, paymentMethod: 'bank' },
    { id: 'g2', item: 'Unlogged spends', amount: 1400, splitWays: 1, date: '2026-10-07', category: 'Travel', categoryConfidence: null, paymentMethod: 'bank' },
  ],
  skipped: [],
  unparsed: [],
}

let onClose: () => void

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.status.mockResolvedValue(status())
  onClose = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
})

async function open() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BalanceCheckModal onClose={onClose} />
    </QueryClientProvider>,
  )
  await screen.findByRole('button', { name: /Save|Check/ })
}

function typeBalance(label: string, value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } })
}

async function press(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

async function finishSuccess() {
  await act(async () => {
    vi.advanceTimersByTime(1100)
  })
}

it('saves the first balance as the starting point', async () => {
  mocks.status.mockResolvedValue(status({ anchor: null, expected: null }))
  mocks.submit.mockResolvedValue({ id: 'c1', kind: 'baseline', reason: 'first', balance: 50000 })
  await open()

  expect(screen.getByText('Your starting balance')).toBeInTheDocument()
  typeBalance('Bank balance', '50000')
  await press('Save')

  expect(mocks.submit).toHaveBeenCalledWith([{ name: 'Bank', balance: 50000 }])
  expect(screen.getByText('Starting point saved. See you next week.')).toBeInTheDocument()
  expect(mocks.track).toHaveBeenCalledWith('balance_checked', { kind: 'baseline', accounts: 1 })
  await finishSuccess()
  expect(onClose).toHaveBeenCalled()
})

it('shows the balance it expects as a hint, never typed in for the user', async () => {
  mocks.submit.mockResolvedValue(measured('square', 0))
  await open()

  expect(screen.getByText('We expect about ₹48,000.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled()
  typeBalance('Bank balance', '48000')
  await press('Check')
  expect(screen.getByText("All square. You've logged everything.")).toBeInTheDocument()
})

it('totals several accounts, named once and asked about again', async () => {
  mocks.status.mockResolvedValue(status({ accounts: ['HDFC'] }))
  mocks.submit.mockResolvedValue(measured('square', 0))
  await open()

  typeBalance('HDFC balance', '40000')
  fireEvent.click(screen.getByRole('button', { name: '+ Add another account' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Account 2 name' }), { target: { value: 'Slice' } })
  typeBalance('Slice balance', '8000')
  expect(screen.getByText('Total ₹48,000')).toBeInTheDocument()
  expect(screen.getByText('We expect about ₹48,000 in total.')).toBeInTheDocument()
  await press('Check')

  expect(mocks.submit).toHaveBeenCalledWith([{ name: 'HDFC', balance: 40000 }, { name: 'Slice', balance: 8000 }])
  expect(mocks.track).toHaveBeenCalledWith('balance_checked', { kind: 'square', accounts: 2 })
})

it('waits for every balance, lets an account go, and asks for distinct names', async () => {
  mocks.status.mockResolvedValue(status({ accounts: ['HDFC', 'Slice'] }))
  await open()

  typeBalance('HDFC balance', '40000')
  expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox', { name: 'Account 2 name' }), { target: { value: 'hdfc' } })
  typeBalance('hdfc balance', '8000')
  await press('Check')
  expect(screen.getByRole('alert')).toHaveTextContent('Give each account its own name.')
  expect(mocks.submit).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Remove hdfc' }))
  expect(screen.queryByRole('textbox', { name: 'hdfc balance' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled()
})

it('says when a changed list of accounts starts over', async () => {
  mocks.submit.mockResolvedValue({ id: 'c3', kind: 'baseline', reason: 'accounts_changed', balance: 59000 })
  await open()
  typeBalance('Bank balance', '59000')
  await press('Check')
  expect(screen.getByText("New starting point saved. We'll compare next week.")).toBeInTheDocument()
})

it('turns spends not logged into estimates on the review card', async () => {
  mocks.submit.mockResolvedValue(measured('unlogged', 3400))
  mocks.resolve.mockResolvedValue({ status: 'resolved', forgotten: 3400, cardShortfall: 0, proposal: estimate, loggedPct: 37 })
  await open()
  typeBalance('Bank balance', '44600')
  await press('Check')

  expect(screen.getByText("₹3,400 left your account that you haven't logged.")).toBeInTheDocument()
  await press(/^Spends I didn't log/)

  expect(mocks.resolve).toHaveBeenCalledWith('c2', {})
  expect(mocks.track).toHaveBeenCalledWith('balance_resolved', { reason: 'unlogged' })
  fireEvent.click(screen.getByRole('button', { name: 'Review Food, Travel as balance_gap' }))
  expect(screen.getByText("You'd logged 37% of what left your account yourself.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(onClose).toHaveBeenCalled()
})

it('goes back to the gap question from the amounts', async () => {
  mocks.submit.mockResolvedValue(measured('unlogged', 3400))
  await open()
  typeBalance('Bank balance', '44600')
  await press('Check')
  await press(/^Card bill/)
  await press('Pick something else')
  expect(screen.getByRole('button', { name: /^Spends I didn't log/ })).toBeInTheDocument()
})

it("won't close mid-review and lose estimates the check already resolved", async () => {
  mocks.submit.mockResolvedValue(measured('unlogged', 3400))
  mocks.resolve.mockResolvedValue({ status: 'resolved', forgotten: 3400, cardShortfall: 0, proposal: estimate, loggedPct: 37 })
  await open()
  typeBalance('Bank balance', '44600')
  await press('Check')
  await press(/^Spends I didn't log/)

  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Review Food, Travel as balance_gap' }))
  expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
})

it('takes a card bill and moved money out of the gap', async () => {
  mocks.submit.mockResolvedValue(measured('unlogged', 11000))
  mocks.resolve.mockResolvedValue({ status: 'resolved', forgotten: 500, cardShortfall: 2000, proposal: estimate, loggedPct: 80 })
  await open()
  typeBalance('Bank balance', '37000')
  await press('Check')
  await press(/^A mix/)

  fireEvent.change(screen.getByRole('textbox', { name: 'Card bill amount' }), { target: { value: '8000' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Moved, lent or cash amount' }), { target: { value: '2500' } })
  expect(screen.getByText("The other ₹500 counts as spends you didn't log.")).toBeInTheDocument()
  await press('Continue')

  expect(mocks.resolve).toHaveBeenCalledWith('c2', { cardBill: 8000, movedOut: 2500 })
  expect(screen.getByText('Your card bill was ₹2,000 more than the card spends you logged, so those are in here too.')).toBeInTheDocument()
})

it('records where extra money came from in one click, and logs nothing', async () => {
  mocks.submit.mockResolvedValue(measured('surplus', -7000))
  mocks.resolve.mockResolvedValue({ status: 'resolved', forgotten: 0, cardShortfall: 0, proposal: null, loggedPct: 100 })
  await open()
  typeBalance('Bank balance', '55000')
  await press('Check')

  expect(screen.getByText("You've got ₹7,000 more than we expected.")).toBeInTheDocument()
  await press('Income or salary')
  expect(mocks.resolve).toHaveBeenCalledWith('c2', { moneyIn: 'income' })
  expect(screen.getByText('Got it. Nothing to log.')).toBeInTheDocument()
  await finishSuccess()
  expect(onClose).toHaveBeenCalled()
})

it('shows a written message, never the server error, when saving fails', async () => {
  mocks.submit.mockRejectedValue(new Error('Failed to save balance: 503'))
  await open()
  typeBalance('Bank balance', '48000')
  await press('Check')
  expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save your balance. Check your connection and try again.")
  expect(screen.queryByText(/503/)).toBeNull()
  expect(onClose).not.toHaveBeenCalled()
})
