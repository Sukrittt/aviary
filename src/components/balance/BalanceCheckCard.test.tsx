import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BalanceStatus } from '@/src/api/balanceChecks'
import { BalanceCheckCard } from './BalanceCheckCard'

const mocks = vi.hoisted(() => ({ status: vi.fn() }))
vi.mock('@/src/hooks/useBalanceCheck', () => ({ useBalanceStatus: () => ({ data: mocks.status() }) }))
vi.mock('./BalanceCheckModal', () => ({ BalanceCheckModal: () => <div role="dialog" aria-label="Balance check" /> }))

const status = (over: Partial<BalanceStatus> = {}): BalanceStatus => ({
  due: true,
  open: false,
  expected: 48000,
  anchor: { timestamp: '2026-09-20T10:00:00+05:30', date: '2026-09-20', balance: 50000 },
  loggedPct: null,
  accounts: [],
  ...over,
})

function show() {
  return render(<QueryClientProvider client={new QueryClient()}><BalanceCheckCard /></QueryClientProvider>)
}

beforeEach(() => {
  window.localStorage.clear()
  mocks.status.mockReturnValue(status())
})

it('asks for the first check and opens it', () => {
  mocks.status.mockReturnValue(status({ anchor: null }))
  show()
  expect(screen.getByText('Weekly balance check')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Check now' }))
  expect(screen.getByRole('dialog', { name: 'Balance check' })).toBeInTheDocument()
})

it('asks to finish an unexplained gap', () => {
  mocks.status.mockReturnValue(status({ open: true }))
  show()
  expect(screen.getByText('Finish your balance check')).toBeInTheDocument()
})

it('puts the prompt off for a day with Later, falling back to the meter', () => {
  mocks.status.mockReturnValue(status({ loggedPct: 92 }))
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Later' }))
  expect(screen.queryByText('Time for a balance check')).toBeNull()
  expect(screen.getByText('92% logged at your last check')).toBeInTheDocument()
})

it('shows the logged meter when no check is due, and opens a check from it', () => {
  mocks.status.mockReturnValue(status({ due: false, loggedPct: 64 }))
  show()
  expect(screen.getByTestId('logged-meter-fill')).toHaveStyle({ width: '64%' })
  fireEvent.click(screen.getByRole('button', { name: /64% logged/ }))
  expect(screen.getByRole('dialog', { name: 'Balance check' })).toBeInTheDocument()
})

it('shows nothing before there is something to say', () => {
  mocks.status.mockReturnValue(status({ due: false, loggedPct: null }))
  const { container } = show()
  expect(container).toBeEmptyDOMElement()
})
