import { it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getUser, updateUser } from '@/src/api/account'
import { queryWrapper } from '@/src/test-utils/queryWrapper'
import { PickExtras } from './PickExtras'

vi.mock('@/src/api/account', () => ({ getUser: vi.fn(), updateUser: vi.fn() }))
vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))

function renderPick(onDone = vi.fn()) {
  render(<PickExtras onDone={onDone} />, { wrapper: queryWrapper() })
  return onDone
}

beforeEach(() => {
  ;(getUser as Mock).mockResolvedValue({ email: 'a@b.com', emailVerified: true, createdAt: '2026-10-13T00:00:00.000Z', hiddenFeatures: ['accounts'] })
  ;(updateUser as Mock).mockImplementation(async (patch) => ({ email: 'a@b.com', emailVerified: true, ...patch }))
})

it('saves every extra left off, keeping core features already hidden', async () => {
  const onDone = renderPick()
  await waitFor(() => expect(getUser).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('switch', { name: 'Turn on Insights' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start budgeting' }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())
  expect(updateUser).toHaveBeenCalledWith({ hiddenFeatures: ['accounts', 'askAviary', 'billScan', 'wrapped', 'investments', 'subscriptions'] })
})

it('stays put and says so when the save fails, then lets you continue', async () => {
  ;(updateUser as Mock).mockRejectedValue(new Error('503'))
  const onDone = renderPick()
  fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save your extras")
  expect(onDone).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(onDone).toHaveBeenCalled()
})
