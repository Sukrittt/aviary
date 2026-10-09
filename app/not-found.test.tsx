import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import NotFound from './not-found'
import RouteError from './error'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

it('404 explains the dead link and sends the visitor home', () => {
  render(<NotFound />)
  expect(screen.getByRole('heading', { name: 'This page flew off' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Take me home' }))
  expect(replace).toHaveBeenCalledWith('/')
})

it('error page retries the route without showing the raw error', () => {
  const reset = vi.fn()
  render(<RouteError error={new Error('Mongo exploded')} reset={reset} />)
  expect(screen.queryByText(/Mongo exploded/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(reset).toHaveBeenCalledTimes(1)
})

it('global error page retries without showing the raw error', async () => {
  vi.doMock('next/font/google', () => ({ Fredoka: () => ({ variable: 'f' }), Nunito: () => ({ variable: 'n' }) }))
  const { default: GlobalError } = await import('./global-error')
  const reset = vi.fn()
  render(<GlobalError error={new Error('Mongo exploded')} reset={reset} />)
  expect(screen.queryByText(/Mongo exploded/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(reset).toHaveBeenCalledTimes(1)
})
