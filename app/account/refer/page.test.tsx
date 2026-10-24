import { expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const track = vi.fn()
vi.mock('@/src/lib/analytics', () => ({ track: (...a: unknown[]) => track(...a) }))
vi.mock('@/src/api/referrals', async (orig) => ({
  ...(await orig<typeof import('@/src/api/referrals')>()),
  getReferrals: async () => ({ code: 'K7QM4P', link: 'https://www.useaviary.com/r/K7QM4P', joined: 2, activated: 1, monthsEarned: 1, canEnterCode: true, referredBy: null }),
}))
const { default: ReferPage } = await import('./page')

it('shows the code, the stats, and shares the link with the message', async () => {
  const share = vi.fn(async () => {})
  Object.assign(navigator, { share })
  render(<QueryClientProvider client={new QueryClient()}><ReferPage /></QueryClientProvider>)
  expect(await screen.findByText('K7QM4P')).toBeInTheDocument()
  expect(screen.getByText('2 friends joined · 1 month earned')).toBeInTheDocument()
  expect(screen.getByLabelText('Got a code from a friend?')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Share link/ }))
  await waitFor(() => expect(track).toHaveBeenCalledWith('referral_link_shared', { method: 'share' }))
  expect(share).toHaveBeenCalledWith({ text: expect.stringContaining('https://www.useaviary.com/r/K7QM4P') })
})
