import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LearningCard } from './LearningCard'

const mocks = vi.hoisted(() => ({ day: 2 }))
vi.mock('@/src/components/wrapped/WeekRecap', () => ({
  useWeekRecap: () => ({ data: { learning: { day: mocks.day, unlocksOn: '2026-10-26', loggedDates: [] } } }),
}))
vi.mock('@/src/hooks/useExpenses', () => ({ useRecentExpenses: () => ({ data: [] }) }))

const week = () => screen.queryByRole('list')

beforeEach(() => {
  window.localStorage.clear()
  mocks.day = 2
})

it('folds the week away and keeps it folded', async () => {
  const { unmount } = render(<LearningCard />)
  expect(week()).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Hide the week' }))
  await waitFor(() => expect(week()).not.toBeInTheDocument())

  unmount()
  render(<LearningCard />)
  expect(week()).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Show the week' }))
  expect(week()).toBeInTheDocument()
})

it('toggles the week from anywhere on the card', async () => {
  render(<LearningCard />)
  fireEvent.click(screen.getByText(/learning your habits/))
  await waitFor(() => expect(week()).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('article'))
  expect(week()).toBeInTheDocument()
})

it('shows the week on day 7 with no toggle, even if it was folded', () => {
  window.localStorage.setItem('mc-learning-collapsed', '1')
  mocks.day = 7
  render(<LearningCard />)
  expect(week()).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /the week/ })).not.toBeInTheDocument()
})
