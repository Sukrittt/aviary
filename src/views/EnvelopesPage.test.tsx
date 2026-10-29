import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { EnvelopesPage } from './EnvelopesPage'
import { getCategories, addCategory, deleteCategory, updateCategory, moveCategory } from '@/src/api/categories'
import { getGroups, addGroup, deleteGroup, updateGroup, moveGroup } from '@/src/api/groups'

vi.mock('@/src/api/categories', () => ({
  getCategories: vi.fn(),
  addCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  moveCategory: vi.fn(),
}))
vi.mock('@/src/api/groups', () => ({
  getGroups: vi.fn(),
  getGroupRows: vi.fn(async () => []),
  addGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  moveGroup: vi.fn(),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/expense/envelopes' }))
// The sidebar reads the WorkOS session, which drags @workos-inc/authkit-nextjs
// (and next/server) into a jsdom run. It is chrome, not what this file tests.
vi.mock('../components/ExpenseSidebar', () => ({ ExpenseSidebar: () => null }))
const spaces = vi.hoisted(() => ({ active: undefined as unknown, readOnly: false }))
vi.mock('../hooks/useSpaces', () => ({ useSpaces: () => spaces }))
vi.mock('../../components/AppearanceProvider', () => ({
  useAppearance: () => ({ theme: 'dark', setTheme: vi.fn() }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function renderPage() {
  return render(<EnvelopesPage />, { wrapper })
}

/**
 * Waits for the categories to land and scopes queries to the group list.
 * "Home" is also a tab-bar destination, so an unscoped findByText('Home')
 * resolves against the tab while the list is still loading.
 */
async function groupList() {
  await screen.findByText('Rent')
  return within(screen.getByRole('list', { name: 'Category groups' }))
}

beforeEach(() => {
  window.localStorage.clear()
  ;(getCategories as Mock).mockResolvedValue([
    { name: '🏠 Rent', group: 'Home' },
    { name: '🚿 Water', group: 'Home', alertPcts: [25, 50] },
    { name: 'Odds' },
    { name: 'Diwali', goal: { amount: 30000, by: '2027-10', repeat: 'yearly' } },
  ])
  ;(getGroups as Mock).mockResolvedValue(['Home'])
  ;(addCategory as Mock).mockResolvedValue(undefined)
  ;(updateCategory as Mock).mockResolvedValue(undefined)
  ;(deleteCategory as Mock).mockResolvedValue(undefined)
  ;(addGroup as Mock).mockResolvedValue(undefined)
  ;(deleteGroup as Mock).mockResolvedValue(undefined)
  ;(updateGroup as Mock).mockResolvedValue(undefined)
  ;(moveCategory as Mock).mockResolvedValue(undefined)
  ;(moveGroup as Mock).mockResolvedValue(undefined)
})

describe('EnvelopesPage', () => {
  it('lists groups with their categories, and ungrouped ones under Other', async () => {
    renderPage()
    const list = await groupList()
    expect(list.getByText('Home')).toBeInTheDocument()
    expect(list.getByText('Rent')).toBeInTheDocument()
    expect(list.getByText('Other')).toBeInTheDocument()
    expect(list.getByText('Odds')).toBeInTheDocument()
  })

  it('links every category to Activity using its full encoded name', async () => {
    renderPage()
    const list = await groupList()
    for (const [label, category] of [['Rent', '🏠 Rent'], ['Water', '🚿 Water'], ['Odds', 'Odds']]) {
      expect(list.getByRole('link', { name: `View transactions for ${label}` }))
        .toHaveAttribute('href', `/expense/transactions?category=${encodeURIComponent(category)}`)
    }
  })

  it('names each icon action in a tooltip on hover', async () => {
    renderPage()
    const list = await groupList()
    await userEvent.hover(list.getByRole('link', { name: 'View transactions for Rent' }))
    expect(await screen.findByText('View transactions')).toBeInTheDocument()
  })

  it('does not advertise drag reordering while DnD is unavailable', async () => {
    renderPage()
    const list = await groupList()
    expect(list.queryByLabelText(/^Reorder /)).not.toBeInTheDocument()
    expect(document.querySelector('.env-group-list [draggable="true"]')).not.toBeInTheDocument()
  })

  it('shows a category its own thresholds, and the defaults for one with none', async () => {
    renderPage()
    expect(
      await screen.findByRole('button', { name: 'Spending alerts for Water: 25%, 50%' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: /Spending alerts for .+: 50%, 90%, 100%/ }).length,
    ).toBeGreaterThan(0)
  })

  it("offers no spending alerts on a goal, since they'd never fire", async () => {
    ;(getCategories as Mock).mockResolvedValue([
      { name: '🏠 Rent', group: 'Home' },
      { name: 'Trip', group: 'Home', goal: { amount: 50000 } },
    ])
    renderPage()
    await screen.findByText('Trip')
    expect(screen.queryByRole('button', { name: /Spending alerts for Trip/ })).toBeNull()
    expect(screen.getByText('Off for goals')).toBeInTheDocument()
  })

  it('creates a category in the group whose add button was used', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Add a category to Home'))
    const dialog = screen.getByRole('dialog', { name: 'Add category' })
    expect(within(dialog).getByRole('button', { name: /Home/ })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByPlaceholderText('Groceries, fuel, gym…'), 'Gas')
    await user.keyboard('{Enter}')
    // The icon follows the name until one is picked.
    await waitFor(() => expect(addCategory).toHaveBeenCalledWith('Gas', 'Home', 'Fire', undefined, undefined))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add category' })).not.toBeInTheDocument())
  })

  it('deletes a group with categories straight away, warning they go to Archive', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Delete Home'))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Home?' })
    expect(dialog).toHaveTextContent('Its 2 categories go to Archive too. You can restore them for 7 days.')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteGroup).toHaveBeenCalledWith('Home'))
    expect(addGroup).not.toHaveBeenCalled()
    expect(updateCategory).not.toHaveBeenCalled()
  })

  it('offers to delete the Archived group like any other', async () => {
    ;(getGroups as Mock).mockResolvedValue(['Home', 'Archived'])
    renderPage()
    expect(await screen.findByLabelText('Delete Archived')).toBeInTheDocument()
  })

  it('does not delete a category when the dialog is cancelled', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Delete Odds'))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Odds?' })
    expect(dialog).toHaveTextContent('It will move to Archive. You can restore it for 7 days.')
    expect(dialog).not.toHaveTextContent(/can't be undone/i)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(deleteCategory).not.toHaveBeenCalled()
  })

  it('deletes a category only after confirming the dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Delete Odds'))
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Delete Odds?' })).getByRole('button', { name: 'Delete' }),
    )
    await waitFor(() => expect(deleteCategory).toHaveBeenCalledWith('Odds'))
  })

  it('renames a category through the edit dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Edit Rent'))
    const dialog = screen.getByRole('dialog', { name: 'Edit category' })
    const input = within(dialog).getByRole('textbox')
    expect(input).toHaveValue('Rent')
    await user.clear(input)
    await user.type(input, 'Mortgage')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    // The legacy emoji stays on the stored name; Mobile still reads it.
    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith('🏠 Rent', { newName: '🏠 Mortgage' }))
  })

  it('edits a goal through the edit dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    // Goal rows offer no spending alerts (they'd never fire); the goal lives in the edit dialog.
    await user.click(await screen.findByLabelText('Edit Diwali'))
    expect(screen.queryByRole('button', { name: /Spending alerts for Diwali/ })).not.toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: 'Edit category' })
    expect(within(dialog).getByRole('button', { name: 'Goal' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByLabelText('By')).toHaveTextContent('Oct 2027')
    const amount = within(dialog).getByLabelText('Amount')
    expect(amount).toHaveValue('30000')
    await user.clear(amount)
    await user.type(amount, '45000')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith('Diwali', { goal: { amount: 45000, by: '2027-10', repeat: 'yearly' } }))
  })

  it('turns a goal back into a spending category from the edit dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Edit Diwali'))
    const dialog = screen.getByRole('dialog', { name: 'Edit category' })
    await user.click(within(dialog).getByRole('button', { name: 'No goal' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith('Diwali', { goal: null }))
    // Untouched otherwise: a plain rename still sends only the name.
  })

  it('picks a new icon from the searchable grid', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Edit Rent'))
    const dialog = screen.getByRole('dialog', { name: 'Edit category' })
    await user.click(within(dialog).getByRole('button', { name: 'Icon: House. Change icon' }))
    // A popover portalled to the body, outside the sheet.
    const picker = screen.getByRole('dialog', { name: 'Choose an icon' })
    await user.type(within(picker).getByPlaceholderText('Search icons'), 'pizza')
    await user.click(within(picker).getByRole('button', { name: 'Pizza' }))
    expect(screen.queryByRole('dialog', { name: 'Choose an icon' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Icon: Pizza. Change icon' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith('🏠 Rent', { icon: 'Pizza' }))
  })

  it('renames a group through the edit dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Edit Home'))
    const dialog = screen.getByRole('dialog', { name: 'Edit group' })
    const input = within(dialog).getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'Housing')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateGroup).toHaveBeenCalledWith('Home', { newName: 'Housing' }))
  })

  it("opens a group's edit dialog on the colour its list tile wears, and saves a picked one", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Edit Home'))
    const dialog = screen.getByRole('dialog', { name: 'Edit group' })
    // An unpicked group wears the accent on the list, so the dialog starts there too.
    expect(within(dialog).getByRole('button', { name: 'Orange' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'Red' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateGroup).toHaveBeenCalledWith('Home', { color: 'coral' }))
  })

  it("saves a category's picked colour", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Edit Rent'))
    const dialog = screen.getByRole('dialog', { name: 'Edit category' })
    await user.click(within(dialog).getByRole('button', { name: 'Teal' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith('🏠 Rent', { color: 'blue' }))
  })

  it('picks a group icon without renaming it', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Edit Home'))
    const dialog = screen.getByRole('dialog', { name: 'Edit group' })
    await user.click(within(dialog).getByRole('button', { name: /Change icon/ }))
    const picker = screen.getByRole('dialog', { name: 'Choose an icon' })
    await user.type(within(picker).getByLabelText('Search icons'), 'tree')
    await user.click(within(picker).getByRole('button', { name: 'Tree' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateGroup).toHaveBeenCalledWith('Home', { icon: 'Tree' }))
  })

  it('writes null for the default thresholds rather than pinning a copy', async () => {
    const user = userEvent.setup()
    renderPage()
    // Water is on a custom set; switching it back to the defaults should
    // clear the override so later default changes still reach it.
    await user.click(await screen.findByRole('button', { name: 'Spending alerts for Water: 25%, 50%' }))
    await user.click(screen.getByRole('button', { name: '25%' }))
    await user.click(screen.getByRole('button', { name: '75%' }))
    await user.click(screen.getByRole('button', { name: '90%' }))
    await user.click(screen.getByRole('button', { name: '100%' }))
    await user.click(screen.getByRole('button', { name: '75%' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith('🚿 Water', { alertPcts: null }))
  })

  it("a member in a lapsed budget hears it's read-only", async () => {
    const user = userEvent.setup()
    spaces.active = { id: 's1', name: 'Home', role: 'member', ownerId: 'u1', members: [{ userId: 'u1', name: 'Priya Shah' }] }
    ;(addGroup as Mock).mockRejectedValue(Object.assign(new Error('402'), { status: 402 }))
    renderPage()
    await user.click(await screen.findByRole('button', { name: /New group/ }))
    await user.type(screen.getByPlaceholderText('Transport, Health…'), 'Home')
    await user.keyboard('{Enter}')
    const alerts = await screen.findAllByRole('alert')
    expect(alerts[0]).toHaveTextContent("This budget is read-only until Priya renews. Your data's safe, and export's always free.")
    spaces.active = undefined
  })

  it('hides every write control in a read-only budget, keeping the list', async () => {
    spaces.readOnly = true
    renderPage()
    const list = await groupList()
    expect(list.getByText('Rent')).toBeInTheDocument()
    expect(list.getByRole('link', { name: 'View transactions for Rent' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New group/ })).not.toBeInTheDocument()
    for (const name of ['Add a category to Home', 'Edit Home', 'Delete Home', 'Edit Rent', 'Delete Rent', 'Move Rent', 'Move Home']) {
      expect(screen.queryByLabelText(name)).not.toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Spending alerts for Water: 25%, 50%' })).toBeDisabled()
    spaces.readOnly = false
  })

  it('surfaces a written message, never the raw server text', async () => {
    const user = userEvent.setup()
    ;(addGroup as Mock).mockRejectedValue(new Error('Failed to add group: 409 already exists'))
    renderPage()
    await user.click(await screen.findByRole('button', { name: /New group/ }))
    await user.type(screen.getByPlaceholderText('Transport, Health…'), 'Home')
    await user.keyboard('{Enter}')
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThan(0)
    for (const alert of alerts) {
      expect(alert).toHaveTextContent('That group already exists.')
      expect(alert).not.toHaveTextContent('409')
    }
  })

  it('creates a group with the icon and color picked in the sheet', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /New group/ }))
    await user.type(screen.getByPlaceholderText('Transport, Health…'), 'Pets')
    await user.click(screen.getByRole('button', { name: /Change icon/ }))
    await user.type(screen.getByLabelText('Search icons'), 'paw')
    await user.click(screen.getByRole('button', { name: 'Paw print' }))
    await user.click(screen.getByRole('button', { name: 'Green' }))
    await user.click(screen.getByRole('button', { name: 'Create group' }))
    await waitFor(() => expect(addGroup).toHaveBeenCalledWith('Pets', { icon: 'PawPrint', color: 'mint' }))
  })

  it('leaves the icon and color to the server when nothing was picked', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /New group/ }))
    await user.type(screen.getByPlaceholderText('Transport, Health…'), 'Pets')
    await user.click(screen.getByRole('button', { name: 'Create group' }))
    await waitFor(() => expect(addGroup).toHaveBeenCalledWith('Pets', { icon: undefined, color: undefined }))
  })

  it('remembers which groups were collapsed', async () => {
    const user = userEvent.setup()
    const first = renderPage()
    await user.click((await groupList()).getByRole('button', { name: /^Home/ }))
    await waitFor(() => expect(window.localStorage.getItem('mc-collapsed-envelopes')).toContain('Home'))
    // Rows leave once the collapse spring finishes.
    await waitFor(() => expect(screen.queryByText('Rent')).not.toBeInTheDocument())
    first.unmount()

    renderPage()
    // Wait on the group's own toggle: the collapsed state loads after mount.
    const list = within(await screen.findByRole('list', { name: 'Category groups' }))
    await waitFor(() => expect(list.getByRole('button', { name: /^Home/ })).toHaveAttribute('aria-expanded', 'false'))
  })

  it('reorders a category within its group from the grip', async () => {
    const user = userEvent.setup()
    renderPage()
    const list = await groupList()
    list.getByRole('button', { name: 'Move Rent' }).focus()
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(moveCategory).toHaveBeenCalledWith('🏠 Rent', 1))
  })

  it('reorders groups but keeps Other pinned and unmovable', async () => {
    ;(getGroups as Mock).mockResolvedValue(['Home', 'Fun'])
    const user = userEvent.setup()
    renderPage()
    const list = await groupList()
    expect(list.queryByRole('button', { name: 'Move Other' })).not.toBeInTheDocument()
    list.getByRole('button', { name: 'Move Fun' }).focus()
    await user.keyboard('{ArrowUp}')
    await waitFor(() => expect(moveGroup).toHaveBeenCalledWith('Fun', 0))
  })
})
