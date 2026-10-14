import { it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { IdeasBoardPage } from './IdeasBoardPage'
import { listIdeas, postIdea, voteIdea, type Idea } from '@/src/api/ideas'
import { applyVote, type VoteValue } from '@/src/lib/ideaVotes'

vi.mock('@/src/api/ideas', () => ({ listIdeas: vi.fn(), postIdea: vi.fn(), voteIdea: vi.fn() }))

const idea = {
  id: 'i1',
  title: 'Split bills',
  description: 'With flatmates',
  authorFirstName: 'Asha',
  status: 'planned' as const,
  up: 3,
  down: 1,
  score: 2,
  createdAt: '2026-10-01T00:00:00.000Z',
  myVote: 0 as const,
  mine: false,
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<IdeasBoardPage />, {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  })
}

/** A fake server: votes change what the next list returns, like the real one. */
let server: Idea[]
function serve(rows: Idea[]) {
  server = rows
  ;(listIdeas as Mock).mockImplementation(async () => server)
  ;(voteIdea as Mock).mockImplementation(async (id: string, value: VoteValue) => {
    server = server.map((r) => (r.id === id ? { ...r, ...applyVote(r, r.myVote, value), myVote: value } : r))
    return server.find((r) => r.id === id)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  serve([idea])
})

it('shows the idea with its status, first name and net score', async () => {
  renderPage()
  const row = (await screen.findByText('Split bills')).closest('li')!
  expect(row).toHaveTextContent('Planned')
  expect(row).toHaveTextContent('Asha')
  expect(within(row).getByRole('group', { name: 'Votes, score 2' })).toBeInTheDocument()
  expect(listIdeas).toHaveBeenCalledWith('top', null)
})

it('upvotes optimistically, then a second tap on the same arrow clears it', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Split bills')
  await user.click(screen.getByRole('button', { name: 'Upvote' }))
  await waitFor(() => expect(voteIdea).toHaveBeenLastCalledWith('i1', 1))
  expect(screen.getByRole('group', { name: 'Votes, score 3' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Upvote' }))
  await waitFor(() => expect(voteIdea).toHaveBeenLastCalledWith('i1', 0))
  expect(screen.getByRole('group', { name: 'Votes, score 2' })).toBeInTheDocument()
})

it('switches to a downvote from an upvote in one tap', async () => {
  serve([{ ...idea, up: 4, score: 3, myVote: 1 }])
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Split bills')
  await user.click(screen.getByRole('button', { name: 'Downvote' }))
  await waitFor(() => expect(voteIdea).toHaveBeenLastCalledWith('i1', -1))
  expect(screen.getByRole('group', { name: 'Votes, score 1' })).toBeInTheDocument()
})

it('saves the last of several quick taps', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Split bills')
  await user.click(screen.getByRole('button', { name: 'Upvote' }))
  await user.click(screen.getByRole('button', { name: 'Upvote' }))
  await user.click(screen.getByRole('button', { name: 'Downvote' }))
  await waitFor(() => expect(server[0]).toMatchObject({ myVote: -1, up: 3, down: 2, score: 1 }))
  await waitFor(() => expect(screen.getByRole('group', { name: 'Votes, score 1' })).toBeInTheDocument())
})

it("doesn't refetch over taps still queued behind a vote", async () => {
  const pending: (() => void)[] = []
  ;(voteIdea as Mock).mockImplementation(() => new Promise<void>((resolve) => pending.push(resolve)))
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Split bills')
  await user.click(screen.getByRole('button', { name: 'Upvote' }))
  await user.click(screen.getByRole('button', { name: 'Downvote' }))
  await waitFor(() => expect(pending).toHaveLength(1))
  await act(async () => pending[0]())
  await waitFor(() => expect(pending).toHaveLength(2))
  expect(listIdeas).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('group', { name: 'Votes, score 1' })).toBeInTheDocument()
  await act(async () => pending[1]())
  await waitFor(() => expect(listIdeas).toHaveBeenCalledTimes(2))
})

it('posts an idea and shows written copy when rate limited', async () => {
  ;(postIdea as Mock).mockRejectedValueOnce(new Error('rate_limited'))
  const user = userEvent.setup()
  renderPage()
  await user.type(screen.getByLabelText('Your idea'), 'Dark charts')
  await user.click(screen.getByRole('button', { name: 'Post idea' }))
  await waitFor(() => expect(screen.getByText("You've posted a few already. Try again later.")).toBeInTheDocument())
  expect(postIdea).toHaveBeenCalledWith('Dark charts', '')
})

it('greets an empty board with the bird, whose button jumps to the idea field', async () => {
  serve([])
  const user = userEvent.setup()
  renderPage()
  expect(await screen.findByRole('heading', { name: "The board's quiet" })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Pitch an idea' }))
  expect(screen.getByLabelText('Your idea')).toHaveFocus()
})

it('filters by status from the dropdown, with an empty state for that status', async () => {
  serve([])
  const user = userEvent.setup()
  renderPage()
  await user.click(screen.getByRole('combobox', { name: 'Status' }))
  await user.click(await screen.findByRole('option', { name: 'Shipped' }))
  expect(listIdeas).toHaveBeenLastCalledWith('top', 'shipped')
  expect(await screen.findByText('No ideas are shipped right now. Try another status.')).toBeInTheDocument()
})
