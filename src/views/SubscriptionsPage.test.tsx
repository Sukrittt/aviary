import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { getSubscriptions } from '@/src/api/subscriptions'
import { SubscriptionsPage, splitSubscriptions } from './SubscriptionsPage'
import { SubscriptionsPanel } from '../components/SubscriptionsPanel'
import type { SubscriptionRow } from '../types'

vi.mock('@/src/api/subscriptions', () => ({
  getSubscriptions: vi.fn(),
  addSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  reactivateSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
}))
vi.mock('../components/RecurringSuggestions', () => ({
  RecurringSuggestions: ({ kind }: { kind: string }) => <div data-testid="subscription-finder">{kind}</div>,
}))
vi.mock('../components/SubscriptionModal', () => ({
  SubscriptionModal: ({ editData }: { editData?: { service: string } }) => (
    <div role="dialog">{editData ? `Edit ${editData.service}` : 'New subscription'}</div>
  ),
}))

function row(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    timestamp: '2026-09-01T00:00:00Z',
    service: 'Netflix',
    amount_inr: '649',
    billing_cycle: 'monthly',
    next_due_date: '2026-10-01',
    status: 'active',
    renewal_or_end_month: '',
    notes: '',
    category: 'Entertainment',
    ...overrides,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<SubscriptionsPage />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(getSubscriptions as Mock).mockResolvedValue([
    row(),
    row({ service: 'Spotify', status: 'cancelled', amount_inr: '119' }),
  ])
})

it('keeps subscription discovery inside the standalone subscriptions screen', async () => {
  renderPage()

  expect(screen.getByTestId('subscription-finder')).toHaveTextContent('subscription')
  expect(await screen.findByText('1 active')).toBeInTheDocument()
  expect(screen.getByText('Netflix')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Add subscription' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('New subscription')
})

it('groups API rows by active and cancelled status', () => {
  const grouped = splitSubscriptions([
    row({ status: 'ACTIVE' }),
    row({ service: 'Spotify', status: 'Cancelled' }),
  ])
  expect(grouped.active.map((item) => item.service)).toEqual(['Netflix'])
  expect(grouped.cancelled.map((item) => item.service)).toEqual(['Spotify'])
})

it('shows the Add control inside the home subscriptions rail', () => {
  const onAdd = vi.fn()
  render(
    <SubscriptionsPanel
      active={splitSubscriptions([row()]).active}
      cancelled={[]}
      hideAmounts={false}
      busyService={null}
      onAdd={onAdd}
      onEdit={vi.fn()}
      onCancel={vi.fn()}
      onReactivate={vi.fn()}
      homeRail
    />,
  )

  expect(screen.getByRole('heading', { name: 'Subscriptions' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  expect(onAdd).toHaveBeenCalledOnce()
})
