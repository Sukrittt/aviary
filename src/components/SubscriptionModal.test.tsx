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

it('shows five suggestions for the currency, then the rest on "Show more"', () => {
  mount()
  expect(screen.getByRole('button', { name: 'JioHotstar' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Swiggy One' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
  fireEvent.click(screen.getByRole('button', { name: 'Swiggy One' }))
  expect(screen.getByLabelText('Service')).toHaveValue('Swiggy One')
  expect(screen.queryByRole('button', { name: 'Netflix' })).not.toBeInTheDocument()
})

it('filters suggestions as you type', () => {
  mount()
  fireEvent.change(screen.getByLabelText('Service'), { target: { value: 'you' } })
  expect(screen.getAllByRole('button', { name: /YouTube/ }).map((b) => b.textContent)).toEqual(['YouTube Premium', 'YouTube Music'])
  expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
})

it('skips suggestions when editing', () => {
  const sub = { service: 'Netflix', amount_inr: '199', billing_cycle: 'monthly', next_due_date: '', notes: '', category: '' }
  mount({ editData: sub })
  expect(screen.queryByRole('button', { name: 'Spotify' })).not.toBeInTheDocument()
})
