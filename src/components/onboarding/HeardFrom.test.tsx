import { it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

async function pick(label: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'Where you heard about us' }))
  await user.click(await screen.findByRole('option', { name: label }))
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(updateUser as Mock).mockImplementation(async (patch) => ({ email: 'a@b.com', emailVerified: true, ...patch }))
})

it('saves and tracks the picked answer', async () => {
  const onDone = renderHeard()
  await pick('Reddit')
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
  await pick('A friend')
  fireEvent.click(screen.getByRole('button', { name: 'Start budgeting' }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())
})
