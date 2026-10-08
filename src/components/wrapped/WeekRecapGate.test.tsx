import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { WeekRecapGate } from './WeekRecap'
import { getWeekRecap, markWeekRecapSeen, type WeekRecap } from '@/src/api/weekRecap'

vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ formatCurrency: (value: number) => `₹${value}` }) }))
vi.mock('@/src/hooks/useHideAmounts', () => ({ useHideAmounts: () => [false] }))
vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/src/api/weekRecap', () => ({ getWeekRecap: vi.fn(), markWeekRecapSeen: vi.fn() }))

const recap = { startDate: '2026-10-01', totalTransactions: 1 } as WeekRecap

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(markWeekRecapSeen).mockResolvedValue()
})

function renderGate(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return { client, ...render(<QueryClientProvider client={client}><WeekRecapGate /></QueryClientProvider>) }
}

it('opens on its own, marks it seen, and does not reopen after a remount', async () => {
  vi.mocked(getWeekRecap).mockResolvedValue({ due: true, recap })
  const { client, unmount } = renderGate()

  expect(await screen.findByText("Let's get to know you")).toBeTruthy()
  await waitFor(() => expect(client.getQueryData(['week-recap'])).toEqual({ due: false }))
  expect(markWeekRecapSeen).toHaveBeenCalledTimes(1)
  // The story stays up after the cache flips.
  expect(screen.getByText("Let's get to know you")).toBeTruthy()

  fireEvent.click(screen.getByLabelText('Close recap'))
  expect(screen.queryByText("Let's get to know you")).toBeNull()

  unmount()
  renderGate(client)
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('stays closed when nothing is due', async () => {
  vi.mocked(getWeekRecap).mockResolvedValue({ due: false })
  renderGate()
  await waitFor(() => expect(getWeekRecap).toHaveBeenCalled())
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(markWeekRecapSeen).not.toHaveBeenCalled()
})

it('advances when each progress bar finishes and stops on the last slide', async () => {
  const full = { ...recap, totalTransactions: 6, daysLogged: 5, repeats: [], usualMinute: 1260, topCategory: null, biggest: null }
  vi.mocked(getWeekRecap).mockResolvedValue({ due: true, recap: full })
  renderGate()
  expect(await screen.findByText("Here's what we learned about you")).toBeTruthy()

  for (let i = 0; i < 4; i++) {
    const bar = document.querySelector('.wrapped-progress b.is-current')
    // jsdom has no AnimationEvent, so React listens for the webkit-prefixed name.
    if (bar) fireEvent(bar, new Event('webkitAnimationEnd', { bubbles: true }))
  }
  expect(await screen.findByText("You're off to a great start")).toBeTruthy()
})

it('pauses the progress bar in place instead of finishing it', async () => {
  vi.mocked(getWeekRecap).mockResolvedValue({ due: true, recap })
  renderGate()
  await screen.findByText("Let's get to know you")
  fireEvent.click(screen.getByLabelText('Pause stories'))
  const bar = document.querySelector<HTMLElement>('.wrapped-progress b.is-current')!
  expect(bar.style.animationPlayState).toBe('paused')
  expect(bar.style.animationDuration).not.toBe('')
})

it('lets Space press a focused button instead of pausing', async () => {
  vi.mocked(getWeekRecap).mockResolvedValue({ due: true, recap })
  renderGate()
  await screen.findByText("Let's get to know you")
  fireEvent.keyDown(screen.getByLabelText('Close recap'), { key: ' ' })
  expect(screen.getByLabelText('Pause stories')).toBeTruthy()
})
