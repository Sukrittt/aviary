import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { EnvelopesPage } from './EnvelopesPage'
import { getCategories, addCategory, deleteCategory, updateCategory } from '@/src/api/categories'
import { getGroups, addGroup, deleteGroup, updateGroup } from '@/src/api/groups'

vi.mock('@/src/api/categories', () => ({
  getCategories: vi.fn(),
  addCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  moveCategory: vi.fn(),
}))
vi.mock('@/src/api/groups', () => ({
  getGroups: vi.fn(),
  addGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  moveGroup: vi.fn(),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/expense/envelopes' }))
// The sidebar reads the WorkOS session, which drags @workos-inc/authkit-nextjs
// (and next/server) into a jsdom run. It is chrome, not what this file tests.
vi.mock('../components/ExpenseSidebar', () => ({ ExpenseSidebar: () => null }))
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
  return within(screen.getByRole('list', { name: 'Envelope groups' }))
}

beforeEach(() => {
  window.localStorage.clear()
  ;(getCategories as Mock).mockResolvedValue([
    { name: '🏠 Rent', group: 'Home' },
    { name: '🚿 Water', group: 'Home', alertPcts: [25, 50] },
    { name: 'Odds' },
  ])
  ;(getGroups as Mock).mockResolvedValue(['Home'])
  ;(addCategory as Mock).mockResolvedValue(undefined)
  ;(updateCategory as Mock).mockResolvedValue(undefined)
  ;(deleteCategory as Mock).mockResolvedValue(undefined)
  ;(addGroup as Mock).mockResolvedValue(undefined)
  ;(deleteGroup as Mock).mockResolvedValue(undefined)
  ;(updateGroup as Mock).mockResolvedValue(undefined)
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

  it('creates a category in the group whose add button was used', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Add a category to Home'))
    await user.type(screen.getByPlaceholderText('Groceries, fuel, gym…'), 'Gas')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(addCategory).toHaveBeenCalledWith('Gas', 'Home'))
  })

  it('re-homes stranded categories into Archived before deleting their group', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Delete Home'))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Home?' })
    expect(dialog).toHaveTextContent('Its categories move to the Archived group. You can restore the group from Archive for 7 days.')
    expect(dialog).not.toHaveTextContent(/can't be undone/i)
    // Deletion only runs after the dialog is confirmed.
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete' }),
    )
    // Archived does not exist yet, so it is created, then both of Home's
    // categories are moved into it, and only then is Home removed.
    await waitFor(() => expect(deleteGroup).toHaveBeenCalledWith('Home'))
    expect(addGroup).toHaveBeenCalledWith('Archived')
    expect(updateCategory).toHaveBeenCalledWith('🏠 Rent', { group: 'Archived' })
    expect(updateCategory).toHaveBeenCalledWith('🚿 Water', { group: 'Archived' })
  })

  it('will not offer to delete the Archived group', async () => {
    ;(getGroups as Mock).mockResolvedValue(['Home', 'Archived'])
    renderPage()
    expect(await screen.findByLabelText('Delete Home')).toBeInTheDocument()
    expect(screen.queryByLabelText('Delete Archived')).not.toBeInTheDocument()
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
    await user.click(await screen.findByLabelText('Rename Rent'))
    const dialog = screen.getByRole('dialog', { name: 'Rename category' })
    const input = within(dialog).getByRole('textbox')
    await user.clear(input)
    await user.type(input, '🏠 Mortgage')
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith('🏠 Rent', { newName: '🏠 Mortgage' }))
  })

  it('renames a group through the edit dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Rename Home'))
    const dialog = screen.getByRole('dialog', { name: 'Rename group' })
    const input = within(dialog).getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'Housing')
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(updateGroup).toHaveBeenCalledWith('Home', 'Housing'))
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
    const list = within(await screen.findByRole('list', { name: 'Envelope groups' }))
    await waitFor(() => expect(list.getByRole('button', { name: /^Home/ })).toHaveAttribute('aria-expanded', 'false'))
  })
})
