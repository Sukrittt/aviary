import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { WeekRecapGate } from './WeekRecap'
import { getWeekRecap, markWeekRecapSeen, type WeekRecap } from '@/src/api/weekRecap'

vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ formatCurrency: (value: number) => `₹${value}` }) }))
vi.mock('@/src/hooks/useHideAmounts', () => ({ useHideAmounts: () => [false] }))
vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/src/api/weekRecap', () => ({ getWeekRecap: vi.fn(), markWeekRecapSeen: vi.fn() }))

const recap = { totalTransactions: 1 } as WeekRecap

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

it('plays on its own and stops on the last slide', async () => {
  const full = { ...recap, totalTransactions: 6, daysLogged: 5, repeats: [], usualMinute: 1260, topCategory: null, biggest: null }
  vi.mocked(getWeekRecap).mockResolvedValue({ due: true, recap: full })
  // Installed before render: the first slide's timer is scheduled on mount.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    renderGate()
    expect(await screen.findByText("Here's what we learned about you")).toBeTruthy()
    for (let i = 0; i < 4; i++) await act(async () => { vi.advanceTimersByTime(5100) })
    expect(await screen.findByText("You're off to a great start")).toBeTruthy()
  } finally {
    vi.useRealTimers()
  }
})
