import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MoneyBrainContext, type MoneyBrainContextValue } from '@/components/moneyBrainContext'
import { CaptureTipCard } from './CaptureTipCard'

const brain: MoneyBrainContextValue = { openMoneyBrain: vi.fn(), openCapture: vi.fn(), closeMoneyBrain: vi.fn(), isMoneyBrainOpen: false }
const show = () => render(<MoneyBrainContext.Provider value={brain}><CaptureTipCard /></MoneyBrainContext.Provider>)

beforeEach(() => {
  window.localStorage.clear()
  vi.clearAllMocks()
})

it('opens capture from Try it, then stays gone', () => {
  const { unmount } = show()
  fireEvent.click(screen.getByRole('button', { name: 'Try it' }))
  expect(brain.openCapture).toHaveBeenCalled()
  expect(screen.queryByText('Spent on a few things?')).toBeNull()
  unmount()
  show()
  expect(screen.queryByText('Spent on a few things?')).toBeNull()
})

it('hides for good on Got it', () => {
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
  expect(screen.queryByText('Spent on a few things?')).toBeNull()
  expect(brain.openCapture).not.toHaveBeenCalled()
})
