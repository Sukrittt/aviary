import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CurrencyScope } from '@/src/context/CurrencyContext'
import { SubscriptionModal } from './SubscriptionModal'

vi.mock('./CategoryPicker', () => ({ CategoryPicker: () => null }))
vi.mock('./DatePicker', () => ({ DatePicker: () => null }))

function mount(props: Partial<Parameters<typeof SubscriptionModal>[0]> = {}, code = 'INR') {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CurrencyScope code={code}>
        <SubscriptionModal onClose={vi.fn()} onSaved={vi.fn()} {...props} />
      </CurrencyScope>
    </QueryClientProvider>,
  )
}

it('suggests services for the currency and fills the name on tap', () => {
  mount()
  expect(screen.getByRole('button', { name: 'JioHotstar' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Spotify' }))
  expect(screen.getByLabelText('Service')).toHaveValue('Spotify')
  expect(screen.queryByRole('button', { name: 'Netflix' })).not.toBeInTheDocument()
})

it('skips suggestions when editing', () => {
  const sub = { service: 'Netflix', amount_inr: '199', billing_cycle: 'monthly', next_due_date: '', notes: '', category: '' }
  mount({ editData: sub })
  expect(screen.queryByRole('button', { name: 'Spotify' })).not.toBeInTheDocument()
})
