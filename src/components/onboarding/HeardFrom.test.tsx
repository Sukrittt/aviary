import { it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getUser, updateUser } from '@/src/api/account'
import { track } from '@/src/lib/analytics'
import { queryWrapper } from '@/src/test-utils/queryWrapper'
import { HeardFrom, heardFromUnasked } from './HeardFrom'

vi.mock('@/src/api/account', () => ({ getUser: vi.fn(), updateUser: vi.fn() }))
vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))

// Extras already chosen, so Home's one-at-a-time rule lets this card through.
const ASKABLE = { email: 'a@b.com', emailVerified: true, onboardedAt: '2026-10-20T00:00:00.000Z', createdAt: '2026-10-20T00:00:00.000Z', hiddenFeatures: [] }

function renderCard() {
  render(<HeardFrom />, { wrapper: queryWrapper() })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  ;(getUser as Mock).mockResolvedValue(ASKABLE)
  ;(updateUser as Mock).mockImplementation(async (patch) => ({ ...ASKABLE, ...patch }))
})

it('waits for the extras card, and never asks twice', () => {
  expect(heardFromUnasked(ASKABLE)).toBe(true)
  expect(heardFromUnasked({ ...ASKABLE, hiddenFeatures: undefined })).toBe(false)
  expect(heardFromUnasked({ ...ASKABLE, heardFrom: 'reddit' })).toBe(false)
  expect(heardFromUnasked({ ...ASKABLE, createdAt: '2026-01-01T00:00:00.000Z' })).toBe(false)
})

it('one click saves and tracks the answer, thanks you, then leaves', async () => {
  renderCard()
  fireEvent.click(await screen.findByRole('button', { name: 'Reddit' }))
  await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ heardFrom: 'reddit' }))
  expect(track).toHaveBeenCalledWith('onboarding_heard_from', { source: 'reddit' })
  expect(screen.getByText('Thanks, that helps.')).toBeTruthy()
  await waitFor(() => expect(screen.queryByText('Thanks, that helps.')).toBeNull(), { timeout: 3000 })
})

it('Not now dismisses it without saving anything', async () => {
  renderCard()
  fireEvent.click(await screen.findByRole('button', { name: 'Not now' }))
  await waitFor(() => expect(screen.queryByText('Where did you hear about us?')).toBeNull())
  expect(updateUser).not.toHaveBeenCalled()
})

it('a failed save still thanks you: the event already has the answer', async () => {
  ;(updateUser as Mock).mockRejectedValue(new Error('503'))
  renderCard()
  fireEvent.click(await screen.findByRole('button', { name: 'A friend' }))
  expect(track).toHaveBeenCalledWith('onboarding_heard_from', { source: 'friend' })
  expect(screen.getByText('Thanks, that helps.')).toBeTruthy()
})
