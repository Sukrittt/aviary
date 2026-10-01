import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { clearAccess } from '../services/accessMode'
import { SignOutDialog } from './ConfirmDialog'

vi.mock('../services/accessMode', () => ({ clearAccess: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

it('shows the loading state before navigation starts and blocks further actions', () => {
  const onCancel = vi.fn()
  let loadingBeforeNavigation = false
  vi.mocked(clearAccess).mockImplementation(() => {
    loadingBeforeNavigation = !!screen.queryByRole('button', { name: 'Signing out…' })
  })
  render(<SignOutDialog onCancel={onCancel} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(loadingBeforeNavigation).toBe(true)
  const signingOut = screen.getByRole('button', { name: 'Signing out…' })
  expect(signingOut).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Signing out…')
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  fireEvent.click(signingOut)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('alertdialog').parentElement!)
  expect(clearAccess).toHaveBeenCalledTimes(1)
  expect(onCancel).not.toHaveBeenCalled()
})

it('still lets people cancel before signing out', () => {
  const onCancel = vi.fn()
  render(<SignOutDialog onCancel={onCancel} />)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(clearAccess).not.toHaveBeenCalled()
})
