import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import GuidedTourPage from './page'
import { completeGuidedTour } from '@/src/api/account'
import { track } from '@/src/lib/analytics'

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/components/MoneyBrainProvider', () => ({ useMoneyBrain: () => ({ openMoneyBrain: vi.fn() }) }))
vi.mock('@/src/api/account', () => ({ completeGuidedTour: vi.fn() }))
vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/src/components/tour/useTourContent', () => ({ useTourContent: () => ({
  CHAPTERS: [{ title: 'Assign', kicker: 'Assign', lede: 'Demo', nudge: 'Try it', href: '/expense' }, { title: 'Log', kicker: 'Log', lede: 'Demo', nudge: 'Try it', href: '/expense/transactions' }],
}) }))
vi.mock('@/src/components/tour/demos/AssignDemo', () => ({ AssignDemo: () => <div>Assignment demo</div> }))
vi.mock('@/src/components/tour/demos/LogDemo', () => ({ LogDemo: () => <div>Logging demo</div> }))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(completeGuidedTour).mockResolvedValue({ email: 'test@example.com', emailVerified: true, guidedTourCompletedAt: '2026-10-01' })
})

function renderTour() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  render(<QueryClientProvider client={client}><GuidedTourPage /></QueryClientProvider>)
  return client
}

it('lets users leave the optional tour without completing its milestone', () => {
  const client = renderTour()
  fireEvent.click(screen.getByRole('button', { name: 'Back to my money' }))
  expect(replace).toHaveBeenCalledWith('/expense')
  expect(completeGuidedTour).not.toHaveBeenCalled()
  expect(track).toHaveBeenCalledWith('tour_skipped', { fresh: false, chapters_done: 0 })
  client.clear()
})

it('saves the shared milestone on finishing the tour and returns to the dashboard', async () => {
  const client = renderTour()
  fireEvent.click(screen.getByRole('button', { name: 'Start the tour' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next · log' }))
  fireEvent.click(screen.getByRole('button', { name: 'Finish the tour' }))
  await waitFor(() => expect(completeGuidedTour).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(client.getQueryData(['user'])).toEqual(expect.objectContaining({ guidedTourCompletedAt: '2026-10-01' })))
  fireEvent.click(screen.getByRole('button', { name: 'Back to my money' }))
  expect(replace).toHaveBeenCalledWith('/expense')
  expect(track).toHaveBeenCalledWith('tour_completed', { fresh: false })
  client.clear()
})
