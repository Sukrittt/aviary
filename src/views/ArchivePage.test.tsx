import { it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ArchivePage } from './ArchivePage'
import { getArchive, restoreArchivedItem } from '@/src/api/account'

vi.mock('@/src/api/account', () => ({
  getArchive: vi.fn(),
  restoreArchivedItem: vi.fn(),
  purgeArchivedItem: vi.fn(),
}))

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000 - 60_000).toISOString()

it('orders by purge date, and restore all keeps what collided', async () => {
  const pets = { id: 'late', collection: 'categories', label: 'Pets', deletedAt: '2026-09-10', purgesAt: inDays(6) }
  const momo = { id: 'soon', collection: 'expenses', label: 'Momo', amount: 120, deletedAt: '2026-09-05', purgesAt: inDays(1) }
  // The restore invalidates the archive, and the server's refetch no longer has Momo.
  ;(getArchive as Mock).mockResolvedValueOnce([pets, momo]).mockResolvedValue([pets])
  ;(restoreArchivedItem as Mock).mockImplementation(async (_c: string, id: string) => {
    if (id === 'late') throw new Error('A live item with this name already exists.')
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<ArchivePage />, {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  })

  const list = await screen.findByRole('list', { name: 'Archived items' })
  const rows = within(list).getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('Gone tomorrow')
  expect(rows[0]).toHaveTextContent('Momo')
  expect(rows[1]).toHaveTextContent('Later this week')

  await userEvent.click(screen.getByRole('button', { name: 'Restore all' }))
  await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restore all' }))

  expect(await screen.findByRole('status')).toHaveTextContent('1 restored, 1 skipped')
  await waitFor(() => expect(within(list).queryByText('Momo')).not.toBeInTheDocument())
  expect(within(list).getByText('Pets')).toBeInTheDocument()
})
