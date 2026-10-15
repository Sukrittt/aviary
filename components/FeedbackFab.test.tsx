import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { submitFeedback } from '@/src/api/feedback'

const state = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null, path: '/expense' }))
vi.mock('@workos-inc/authkit-nextjs/components', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('next/navigation', () => ({ usePathname: () => state.path, useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/src/api/feedback', () => ({ submitFeedback: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/src/api/ideas', () => ({ postIdea: vi.fn() }))

const { FeedbackFab } = await import('./FeedbackFab')

beforeEach(() => {
  state.user = { id: 'u1' }
  state.path = '/expense'
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)

it('opens the idea form in a dialog', async () => {
  render(<FeedbackFab />, { wrapper })
  await userEvent.click(screen.getByText('Share an idea'))
  const dialog = screen.getByRole('dialog', { name: 'Share an idea' })
  expect(dialog).toContainElement(screen.getByLabelText('Your idea'))
  expect(screen.getByRole('link', { name: 'Peek at the board' })).toHaveAttribute('href', '/account/ideas')
})

it('sends a bug report from the dialog and closes it', async () => {
  render(<FeedbackFab />, { wrapper })
  await userEvent.click(screen.getByText('Report a bug'))
  await userEvent.type(screen.getByLabelText('Title'), 'Chart is blank')
  await userEvent.type(screen.getByLabelText('Details'), 'On insights')
  await userEvent.click(screen.getByRole('button', { name: 'Send report' }))
  expect(submitFeedback).toHaveBeenCalledWith('bug', 'Chart is blank', 'On insights', undefined)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 3000 })
})

it.each([
  ['signed out', null, '/expense'],
  ['on the landing page', { id: 'u1' }, '/'],
  ['on admin', { id: 'u1' }, '/admin/ideas'],
  ['on the board itself', { id: 'u1' }, '/account/ideas'],
  ['on the bug form itself', { id: 'u1' }, '/account/feedback'],
])('stays hidden %s', (_, user, path) => {
  state.user = user
  state.path = path
  render(<FeedbackFab />, { wrapper })
  expect(screen.queryByRole('button', { name: 'Send feedback' })).toBeNull()
})
