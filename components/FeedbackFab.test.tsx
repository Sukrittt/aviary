import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const state = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null, path: '/expense' }))
vi.mock('@workos-inc/authkit-nextjs/components', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('next/navigation', () => ({ usePathname: () => state.path }))

const { FeedbackFab } = await import('./FeedbackFab')

beforeEach(() => {
  state.user = { id: 'u1' }
  state.path = '/expense'
})

it('offers the ideas board and the bug form from the app', () => {
  render(<FeedbackFab />)
  expect(screen.getByRole('button', { name: 'Send feedback' })).toBeInTheDocument()
  expect(screen.getByText('Share an idea').closest('a')).toHaveAttribute('href', '/account/ideas')
  expect(screen.getByText('Report a bug').closest('a')).toHaveAttribute('href', '/account/feedback')
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
  render(<FeedbackFab />)
  expect(screen.queryByRole('button', { name: 'Send feedback' })).toBeNull()
})
