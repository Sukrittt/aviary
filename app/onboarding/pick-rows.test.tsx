import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SetupWizardPage from './page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))

function toGroupsStep() {
  render(<QueryClientProvider client={new QueryClient()}><SetupWizardPage /></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: /50,000/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

function toCategoriesStep() {
  toGroupsStep()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

function categoryToolbar(groupName?: string) {
  return within(screen.getByRole('group', { name: groupName ? `Category selection for ${groupName}` : 'Category selection' }))
}

describe('onboarding pick rows', () => {
  it('selects and deselects all categories, skips drafts, and restores the previous selection', () => {
    toCategoriesStep()
    fireEvent.click(screen.getAllByRole('button', { name: /Add category/ })[0])
    const toolbar = categoryToolbar()
    expect(toolbar.getByText('5 categories selected')).toBeTruthy()
    fireEvent.click(toolbar.getByRole('button', { name: 'Select all' }))
    expect(toolbar.getByText('9 categories selected')).toBeTruthy()
    expect(toolbar.getByRole('button', { name: 'Select all' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Select Category name' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('checkbox', { name: 'Select Category name' })).toHaveAccessibleDescription('Name to select')
    fireEvent.click(toolbar.getByRole('button', { name: 'Undo category selection' }))
    expect(toolbar.getByText('5 categories selected')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Select Transport' })).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toolbar.getByRole('button', { name: 'Deselect all' }))
    expect(toolbar.getByText('0 categories selected')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(screen.getByText('Select at least one category to continue')).toBeTruthy()
    expect(screen.getByDisplayValue('Rent')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change emoji for Rent' })).toHaveTextContent('🏠')
    fireEvent.click(toolbar.getByRole('button', { name: 'Undo category selection' }))
    expect(toolbar.getByText('5 categories selected')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  it('limits per-group category actions and Undo to that group', () => {
    toCategoriesStep()
    const essentials = categoryToolbar('Essentials')
    fireEvent.click(essentials.getByRole('button', { name: 'Deselect all' }))
    expect(categoryToolbar().getByText('2 categories selected')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Select Rent' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('checkbox', { name: 'Deselect Eating out' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('All categories in Essentials deselected.')
    fireEvent.click(screen.getByRole('button', { name: 'Undo category selection' }))
    expect(categoryToolbar().getByText('5 categories selected')).toBeTruthy()
    fireEvent.click(essentials.getByRole('button', { name: 'Select all' }))
    expect(categoryToolbar().getByText('6 categories selected')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Deselect Transport' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('checkbox', { name: 'Select Software' })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Undo category selection' }))
    expect(screen.getByRole('checkbox', { name: 'Select Transport' })).toHaveAttribute('aria-checked', 'false')
  })

  it('enforces unique category names across groups for both scoped and global Select all', () => {
    toCategoriesStep()
    const softwareInput = screen.getByDisplayValue('Software')
    fireEvent.change(softwareInput, { target: { value: ' rent ' } })
    fireEvent.click(categoryToolbar('Lifestyle').getByRole('button', { name: 'Select all' }))
    expect(screen.getByRole('checkbox', { name: 'Select rent' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('checkbox', { name: 'Deselect Rent' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Duplicate names left unselected.')
    expect(categoryToolbar('Lifestyle').getByRole('button', { name: 'Select all' })).toBeDisabled()
    fireEvent.click(categoryToolbar().getByRole('button', { name: 'Deselect all' }))
    fireEvent.click(categoryToolbar().getByRole('button', { name: 'Select all' }))
    expect(categoryToolbar().getByText('8 categories selected')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Select rent' })).toHaveAttribute('aria-checked', 'false')

    fireEvent.change(softwareInput, { target: { value: 'Apps' } })
    expect(screen.queryByRole('button', { name: 'Undo category selection' })).toBeNull()
  })

  it('preserves categories in groups excluded from the category step', () => {
    toCategoriesStep()
    fireEvent.click(categoryToolbar().getByRole('button', { name: 'Deselect all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Savings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('checkbox', { name: 'Deselect Emergency fund' })).toHaveAttribute('aria-checked', 'true')
    expect(categoryToolbar().getByText('1 category selected')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Undo category selection' })).toBeNull()
  })

  it('deselects 50 custom groups in one action and restores the exact selection with Undo', () => {
    toGroupsStep()
    const addGroupButton = screen.getByRole('button', { name: /Add your own group/ })
    for (let i = 1; i <= 50; i++) {
      fireEvent.click(addGroupButton)
      fireEvent.change(screen.getAllByPlaceholderText('Group name').at(-1)!, { target: { value: `Custom ${i}` } })
    }
    const toolbar = within(screen.getByRole('group', { name: 'Group selection' }))
    expect(toolbar.getByText('52 groups selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(53)
    expect(screen.getAllByRole('checkbox').every((c) => c.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(toolbar.getByText('0 groups selected')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Deselect all' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(screen.getByText('Select at least one group to continue')).toBeTruthy()
    expect(screen.getByRole('status')).toHaveTextContent('All groups deselected.')
    expect(screen.getByDisplayValue('Custom 50')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change emoji for Custom 50' })).toHaveTextContent('🎁')

    fireEvent.click(screen.getByRole('button', { name: 'Undo group selection' }))
    expect(toolbar.getByText('52 groups selected')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Select Savings' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('checkbox', { name: 'Deselect Custom 50' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Undo group selection' })).toBeNull()
  }, 15000)

  it('selects named groups, leaves drafts incomplete, and can undo Select all', () => {
    toGroupsStep()
    fireEvent.click(screen.getByRole('button', { name: /Add your own group/ }))
    const draft = screen.getByRole('checkbox', { name: 'Select Group name' })
    expect(draft).toHaveAccessibleDescription('Name to select')
    expect(screen.getByText('Name to select')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    const toolbar = within(screen.getByRole('group', { name: 'Group selection' }))
    expect(toolbar.getByText('3 groups selected')).toBeTruthy()
    expect(draft).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: 'Select all' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Undo group selection' }))
    expect(toolbar.getByText('2 groups selected')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Select Savings' })).toHaveAttribute('aria-checked', 'false')
  })

  it('keeps existing selections when Select all encounters duplicate names', () => {
    toGroupsStep()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Deselect Essentials' }))
    fireEvent.change(screen.getByDisplayValue('Savings'), { target: { value: ' essentials ' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select essentials' }))
    fireEvent.click(screen.getByRole('button', { name: /Add your own group/ }))
    fireEvent.change(screen.getAllByPlaceholderText('Group name').at(-1)!, { target: { value: 'Pets' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Deselect Pets' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByRole('checkbox', { name: 'Select Essentials' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('checkbox', { name: 'Deselect essentials' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('checkbox', { name: 'Deselect Pets' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Duplicate names left unselected.')

    // Starting from none still selects only one copy of each name.
    fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByRole('checkbox', { name: 'Deselect Essentials' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('checkbox', { name: 'Select essentials' })).toHaveAttribute('aria-checked', 'false')
  })

  it('clears Undo when the user makes a new selection or edits a group', () => {
    toGroupsStep()
    fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Essentials' }))
    expect(screen.queryByRole('button', { name: 'Undo group selection' })).toBeNull()
    expect(within(screen.getByRole('group', { name: 'Group selection' })).getByText('1 group selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }))
    fireEvent.change(screen.getByDisplayValue('Lifestyle'), { target: { value: 'Fun' } })
    expect(screen.queryByRole('button', { name: 'Undo group selection' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Select Fun' })).toHaveAttribute('aria-checked', 'false')
  })

  it('keeps a new group unchecked until it has a name', () => {
    toGroupsStep()
    fireEvent.click(screen.getByRole('button', { name: /Add your own group/ }))
    expect(screen.getByRole('checkbox', { name: 'Select Group name' }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Group name' }))
    expect(screen.getByRole('checkbox', { name: 'Select Group name' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('alert').textContent).toContain('Give this group a name first.')
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

describe('assign step rename', () => {
  it('renames in place, keeping the old name on a blank or clashing one', () => {
    toCategoriesStep()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    const rent = screen.getByRole('textbox', { name: 'Rename Rent' })
    fireEvent.focus(rent)
    fireEvent.change(rent, { target: { value: 'Home rent' } })
    fireEvent.blur(rent)
    const home = screen.getByRole('textbox', { name: 'Rename Home rent' })
    expect(home).toHaveValue('Home rent')

    fireEvent.focus(home)
    fireEvent.change(home, { target: { value: 'groceries' } })
    fireEvent.blur(home)
    expect(home).toHaveValue('Home rent')
    expect(screen.getByRole('alert').textContent).toContain('already got a category called groceries')

    fireEvent.focus(home)
    fireEvent.change(home, { target: { value: '   ' } })
    fireEvent.blur(home)
    expect(home).toHaveValue('Home rent')

    fireEvent.focus(home)
    fireEvent.change(home, { target: { value: 'Nope' } })
    fireEvent.keyDown(home, { key: 'Escape' })
    expect(home).toHaveValue('Home rent')
  })

  it('picks a new emoji for a category from the same grid', () => {
    toCategoriesStep()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change emoji for Rent' }))
    fireEvent.click(screen.getByRole('button', { name: '🐶' }))
    expect(screen.queryByRole('group', { name: 'Pick an emoji' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Change emoji for Rent' })).toHaveTextContent('🐶')
  })
})
