import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SetupWizardPage from './page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))

function toGroupsStep() {
  render(<QueryClientProvider client={new QueryClient()}><SetupWizardPage /></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: /50,000/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('onboarding pick rows', () => {
  it('keeps a new group unchecked until it has a name', () => {
    toGroupsStep()
    fireEvent.click(screen.getByRole('button', { name: /Add your own group/ }))
    expect(screen.getByRole('checkbox', { name: 'Select Group name' }).getAttribute('aria-checked')).toBe('false')
    const input = screen.getAllByPlaceholderText('Group name').at(-1)!
    fireEvent.change(input, { target: { value: 'Pets' } })
    expect(screen.getByRole('checkbox', { name: 'Deselect Pets' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByRole('checkbox', { name: 'Select Group name' }).getAttribute('aria-checked')).toBe('false')
  })

  it('never lets two checked groups share a name', () => {
    toGroupsStep()
    // Savings starts unchecked; renaming it to a checked group's name keeps it unchecked.
    fireEvent.change(screen.getByDisplayValue('Savings'), { target: { value: 'essentials ' } })
    const dup = screen.getByRole('checkbox', { name: 'Select essentials' })
    fireEvent.click(dup)
    expect(dup.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('alert').textContent).toContain('already got a group called essentials')

    // Renaming a checked group into a duplicate unchecks it.
    fireEvent.change(screen.getByDisplayValue('Lifestyle'), { target: { value: 'Essentials' } })
    expect(screen.getAllByRole('checkbox', { name: 'Select Essentials' })).toHaveLength(1)

    // Renaming away from the duplicate checks it again.
    fireEvent.change(screen.getAllByDisplayValue('Essentials')[1], { target: { value: 'Fun' } })
    expect(screen.getByRole('checkbox', { name: 'Deselect Fun' }).getAttribute('aria-checked')).toBe('true')
  })

  it('never lets two checked categories share a name, even across groups', () => {
    toGroupsStep()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    // Software (Lifestyle) starts unchecked; renaming it to Rent (Essentials) stays unchecked.
    fireEvent.change(screen.getByDisplayValue('Software'), { target: { value: 'rent' } })
    const dup = screen.getByRole('checkbox', { name: 'Select rent' })
    fireEvent.click(dup)
    expect(dup.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('alert').textContent).toContain('already got a category called rent')
  })

  it('opens a grid from the emoji, applies the pick, and closes on Escape', () => {
    toGroupsStep()
    fireEvent.click(screen.getByRole('button', { name: 'Change emoji for Essentials' }))
    fireEvent.click(screen.getByRole('button', { name: '🐶' }))
    expect(screen.queryByRole('group', { name: 'Pick an emoji' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Change emoji for Essentials' }).textContent).toBe('🐶')

    fireEvent.click(screen.getByRole('button', { name: 'Change emoji for Essentials' }))
    expect(screen.getByRole('group', { name: 'Pick an emoji' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'Pick an emoji' })).toBeNull()
  })
})
