import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import NotFound from './not-found'
import RouteError from './error'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

// The screens load through next/dynamic (so their app stylesheets stay off public pages), hence findBy.
it('404 explains the dead link and sends the visitor home', async () => {
  render(<NotFound />)
  expect(await screen.findByRole('heading', { name: 'This page flew off' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Take me home' }))
  expect(replace).toHaveBeenCalledWith('/')
})

it('error page retries the route without showing the raw error', async () => {
  const reset = vi.fn()
  render(<RouteError error={new Error('Mongo exploded')} reset={reset} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
  expect(screen.queryByText(/Mongo exploded/)).not.toBeInTheDocument()
  expect(reset).toHaveBeenCalledTimes(1)
})

it('global error page retries without showing the raw error', async () => {
  vi.doMock('next/font/google', () => ({ Geist: () => ({ variable: 'g' }) }))
  const { default: GlobalError } = await import('./global-error')
  const reset = vi.fn()
  render(<GlobalError error={new Error('Mongo exploded')} reset={reset} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
  expect(screen.queryByText(/Mongo exploded/)).not.toBeInTheDocument()
  expect(reset).toHaveBeenCalledTimes(1)
})
