import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from './Select'

const OPTIONS = [
  { value: 'food', label: 'Food' },
  { value: 'rent', label: 'Rent', disabled: true },
  { value: 'fun', label: 'Fun' },
]

function setup(value = '') {
  const onChange = vi.fn()
  render(<Select value={value} onChange={onChange} options={OPTIONS} placeholder="Assign to" aria-label="Category" />)
  return { onChange, trigger: screen.getByRole('combobox', { name: 'Category' }), user: userEvent.setup() }
}

describe('Select', () => {
  it('shows the placeholder, then opens a listbox and picks an option', async () => {
    const { onChange, trigger, user } = setup()
    expect(trigger.textContent).toContain('Assign to')
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: 'Fun' }))
    expect(onChange).toHaveBeenCalledWith('fun')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('shows the selected label and marks it selected', async () => {
    const { trigger, user } = setup('food')
    expect(trigger.textContent).toContain('Food')
    await user.click(trigger)
    expect((await screen.findByRole('option', { name: 'Food' })).getAttribute('aria-selected')).toBe('true')
  })

  it('navigates by keyboard; a disabled option can be passed over but not picked', async () => {
    const { onChange, trigger, user } = setup('food')
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    await screen.findByRole('listbox')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('fun')
  })

  it('closes on Escape without changing', async () => {
    const { onChange, trigger, user } = setup('food')
    await user.click(trigger)
    await screen.findByRole('listbox')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores disabled options', async () => {
    const { onChange, trigger, user } = setup()
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: 'Rent' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('searchable: filters options and picks the match', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Select value="" onChange={onChange} options={OPTIONS} aria-label="Category" searchable />)
    await user.click(screen.getByRole('combobox', { name: 'Category' }))
    await user.type(await screen.findByRole('combobox', { name: 'Search Category' }), 'fu')
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Food' })).toBeNull())
    await user.click(screen.getByRole('option', { name: 'Fun' }))
    expect(onChange).toHaveBeenCalledWith('fun')
  })

  it('searchable: shows "No matches" for an empty filter result', async () => {
    const user = userEvent.setup()
    render(<Select value="" onChange={vi.fn()} options={OPTIONS} aria-label="Cat2" searchable />)
    await user.click(screen.getByRole('combobox', { name: 'Cat2' }))
    await user.type(await screen.findByRole('combobox', { name: 'Search Cat2' }), 'zzz')
    expect(await screen.findByText('No matches')).toBeTruthy()
  })

  it('shows an option icon in both the row and the trigger once selected', async () => {
    const withIcons = [{ value: 'rent', label: 'Rent', icon: '🏠' }, { value: 'food', label: 'Food' }]
    const user = userEvent.setup()
    render(<Select value="rent" onChange={vi.fn()} options={withIcons} aria-label="Cat3" />)
    // aria-hidden icons don't count toward the accessible name; check the rendered text instead.
    expect(screen.getByRole('combobox', { name: 'Cat3' }).textContent).toBe('🏠Rent')
    await user.click(screen.getByRole('combobox', { name: 'Cat3' }))
    expect((await screen.findByRole('option', { name: 'Rent' })).textContent).toBe('🏠Rent')
    expect(screen.getByRole('option', { name: 'Food' })).toBeTruthy()
  })
})
