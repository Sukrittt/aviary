import { it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { updateUser } from '@/src/api/account'
import { track } from '@/src/lib/analytics'
import { queryWrapper } from '@/src/test-utils/queryWrapper'
import { HeardFrom } from './HeardFrom'

vi.mock('@/src/api/account', () => ({ getUser: vi.fn(), updateUser: vi.fn() }))
vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))

function renderHeard(onDone = vi.fn()) {
  render(<HeardFrom onDone={onDone} />, { wrapper: queryWrapper() })
  return onDone
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(updateUser as Mock).mockImplementation(async (patch) => ({ email: 'a@b.com', emailVerified: true, ...patch }))
})

it('saves and tracks the picked answer', async () => {
  const onDone = renderHeard()
  fireEvent.click(screen.getByRole('button', { name: 'Reddit' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start budgeting' }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())
  expect(updateUser).toHaveBeenCalledWith({ heardFrom: 'reddit' })
  expect(track).toHaveBeenCalledWith('onboarding_heard_from', { source: 'reddit' })
})

it('skips without saving anything', () => {
  const onDone = renderHeard()
  fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
  expect(onDone).toHaveBeenCalled()
  expect(updateUser).not.toHaveBeenCalled()
})

it('moves on even when the save fails', async () => {
  ;(updateUser as Mock).mockRejectedValue(new Error('503'))
  const onDone = renderHeard()
  fireEvent.click(screen.getByRole('button', { name: 'A friend' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start budgeting' }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())
})
