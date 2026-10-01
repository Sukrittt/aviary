import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { BirdEmptyState } from './BirdEmptyState'

it('renders accessible copy and its next action', () => {
  const onClick = vi.fn()
  render(
    <BirdEmptyState
      title="Your story starts here"
      description="Log your first expense and it will show up here."
      action={{ label: 'Log an expense', onClick }}
    />,
  )

  expect(screen.getByRole('heading', { name: 'Your story starts here' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Log an expense' }))
  expect(onClick).toHaveBeenCalledOnce()
})
