import { it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getUser, updateUser } from '@/src/api/account'
import { track } from '@/src/lib/analytics'
import { queryWrapper } from '@/src/test-utils/queryWrapper'
import { PickExtras } from './PickExtras'

vi.mock('@/src/api/account', () => ({ getUser: vi.fn(), updateUser: vi.fn() }))
vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))

const NEW_ACCOUNT = { email: 'a@b.com', emailVerified: true, onboardedAt: '2026-10-20T00:00:00.000Z', createdAt: '2026-10-20T00:00:00.000Z' }

function renderCard() {
  render(<PickExtras />, { wrapper: queryWrapper() })
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(getUser as Mock).mockResolvedValue(NEW_ACCOUNT)
  ;(updateUser as Mock).mockImplementation(async (patch) => ({ ...NEW_ACCOUNT, ...patch }))
})

it('saves the extras switched on, keeping core features already hidden, then leaves', async () => {
  ;(getUser as Mock).mockResolvedValue({ ...NEW_ACCOUNT, hiddenFeatures: undefined })
  renderCard()
  fireEvent.click(await screen.findByRole('switch', { name: 'Turn on Insights' }))
  fireEvent.click(screen.getByRole('button', { name: 'Turn on 1' }))
  await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ hiddenFeatures: ['askAviary', 'billScan', 'wrapped', 'investments', 'subscriptions'] }))
  expect(track).toHaveBeenCalledWith('onboarding_extras_chosen', { extras: 'insights', count: 1 })
  // The saved check holds the card up, then it goes.
  expect(screen.getByRole('img', { name: 'Turned on' })).toBeTruthy()
  await waitFor(() => expect(screen.queryByText('Want any extras?')).toBeNull(), { timeout: 3000 })
})

it('Not now saves the defaults and the card goes', async () => {
  renderCard()
  fireEvent.click(await screen.findByRole('button', { name: 'Not now' }))
  await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ hiddenFeatures: ['askAviary', 'billScan', 'wrapped', 'investments', 'subscriptions', 'insights'] }))
  expect(track).toHaveBeenCalledWith('onboarding_extras_chosen', { extras: '', count: 0 })
  await waitFor(() => expect(screen.queryByText('Want any extras?')).toBeNull())
})

it('stays and says so when the save fails', async () => {
  ;(updateUser as Mock).mockRejectedValue(new Error('503'))
  renderCard()
  fireEvent.click(await screen.findByRole('switch', { name: 'Turn on Insights' }))
  fireEvent.click(screen.getByRole('button', { name: 'Turn on 1' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save your extras")
  expect(screen.getByText('Want any extras?')).toBeTruthy()
})

it('never shows for an account that already chose', async () => {
  ;(getUser as Mock).mockResolvedValue({ ...NEW_ACCOUNT, hiddenFeatures: ['accounts'] })
  renderCard()
  await waitFor(() => expect(getUser).toHaveBeenCalled())
  expect(screen.queryByText('Want any extras?')).toBeNull()
})

it('locks the switches once a save has started, so a late flip is never left unsaved', async () => {
  ;(updateUser as Mock).mockReturnValue(new Promise(() => {}))
  renderCard()
  fireEvent.click(await screen.findByRole('switch', { name: 'Turn on Insights' }))
  fireEvent.click(screen.getByRole('button', { name: 'Turn on 1' }))
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Turn on Scan a bill' })).toBeDisabled())
  expect(updateUser).toHaveBeenCalledTimes(1)
})

it('comes back with its error when Not now fails to save', async () => {
  ;(updateUser as Mock).mockRejectedValue(new Error('offline'))
  renderCard()
  fireEvent.click(await screen.findByRole('button', { name: 'Not now' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save your extras.")
  expect(screen.getByText('Want any extras?')).toBeInTheDocument()
})
