import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionsFeed } from './TransactionsFeed'
import type { Transaction } from '../lib/expenseTransactions'
import { avatarStyleFor } from '../lib/emoji'

const m = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  hasNextPage: false,
  fetchNextPage: vi.fn(),
}))
vi.mock('../hooks/useExpenses', () => ({
  useExpensesFeed: () => ({
    data: { pages: [{ rows: m.rows, page: 1, pageCount: 1 }] },
    isLoading: false,
    isError: false,
    hasNextPage: m.hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage: m.fetchNextPage,
  }),
}))
vi.mock('../hooks/useCategories', () => ({ useCategoryIcons: () => new Map(), useCategoryStyle: () => (name: string) => avatarStyleFor(name) }))

const row = (over: Record<string, unknown> = {}) => ({
  id: 'e1', version: 1, timestamp: '2026-10-12T10:00:00', date: '2026-10-12', item: 'Plant', amount_inr: '300',
  category: 'Home', notes: '', source: 'manual', account_id: '', ...over,
})
const txnKey = (t: Transaction) => t.id

function renderFeed(props: Partial<Parameters<typeof TransactionsFeed>[0]> = {}) {
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(
    <TransactionsFeed
      params={{}}
      hideAmounts={false}
      accountNameOf={(id) => (id === 'acc1' ? 'HDFC Savings' : '')}
      removedKeys={new Set()}
      txnKey={txnKey}
      isDeleting={() => false}
      onDeleteDone={() => {}}
      onEdit={onEdit}
      onDelete={onDelete}
      empty={<p>nothing here</p>}
      {...props}
    />,
  )
  return { onEdit, onDelete }
}

beforeEach(() => {
  vi.clearAllMocks()
  m.rows = [row()]
  m.hasNextPage = false
})

it('shows a photo card for a signed photo and a compact card otherwise, with no add-photo button', () => {
  m.rows = [row({ id: 'a', item: 'Tea', has_photo: true, photo_url: 'https://blob.test/a.jpg?s=1' }), row({ id: 'b', item: 'Plant' })]
  renderFeed()
  expect(screen.getByRole('heading', { name: 'Monday, 12 October 2026' })).toBeInTheDocument()
  expect(document.querySelector('img.feed-card-photo')).toHaveAttribute('src', 'https://blob.test/a.jpg?s=1')
  expect(document.querySelectorAll('.feed-card-media')).toHaveLength(1)
  expect(document.querySelector('.feed-card-placeholder')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Add a photo/ })).not.toBeInTheDocument()
  expect(screen.getByText("You're all caught up.")).toBeInTheDocument()
})

it('shows the empty state when nothing matches', () => {
  m.rows = []
  renderFeed()
  expect(screen.getByText('nothing here')).toBeInTheDocument()
})

it('loads the next page on request', () => {
  m.hasNextPage = true
  renderFeed()
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
  expect(m.fetchNextPage).toHaveBeenCalled()
})

describe('detail dialog', () => {
  it('opens from the card with everything about the expense', () => {
    m.rows = [row({ account_id: 'acc1', notes: 'For the balcony', has_photo: true, photo_url: 'https://blob.test/a.jpg?s=1' })]
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Plant, Home. View details' }))
    const dialog = screen.getByRole('dialog', { name: 'Plant' })
    expect(within(dialog).getByText('Monday, 12 October 2026')).toBeInTheDocument()
    expect(within(dialog).getByText('HDFC Savings')).toBeInTheDocument()
    expect(within(dialog).getByText('For the balcony')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Open photo of Plant' })).toHaveAttribute('href', 'https://blob.test/a.jpg?s=1')
  })

  it('shows the time for a same-day expense and when it was logged for a backdated one', () => {
    m.rows = [
      row({ id: 'a', item: 'Tea', date: '2026-10-12', timestamp: '2026-10-12T23:30:00+05:30' }),
      row({ id: 'b', item: 'Rent', date: '2026-10-01', timestamp: '2026-10-12T09:00:00+05:30' }),
    ]
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Tea, Home. View details' }))
    expect(within(screen.getByRole('dialog', { name: 'Tea' })).getByText('Time')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Rent, Home. View details' }))
    expect(within(screen.getByRole('dialog', { name: 'Rent' })).getByText('Logged')).toBeInTheDocument()
  })

  it('says when an expense has no account', () => {
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Plant, Home. View details' }))
    expect(within(screen.getByRole('dialog', { name: 'Plant' })).getByText('Not set')).toBeInTheDocument()
  })

  it('edits straight away', () => {
    const { onEdit } = renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Plant, Home. View details' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Plant' })).getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }))
  })

  it('closes before asking to delete', async () => {
    const { onDelete } = renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Plant, Home. View details' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Plant' })).getByRole('button', { name: 'Delete' }))
    expect(onDelete).not.toHaveBeenCalled()
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' })))
  })

  it('puts focus on Close when it opens', () => {
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Plant, Home. View details' }))
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })
})
