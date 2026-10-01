import { it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AutoPickStatus, PICKED_LABEL, PICKING_LABEL } from './AutoPickStatus'

const groceries = { emoji: '🛒', name: 'Groceries' }
const rollEmojis = ['🍔', '🚕', '🛒']
// Roll decel steps (190 + 250 + 330ms) plus the pill's exit, with slack.
const SETTLE = { timeout: 2000 }

it('shows nothing when there is no auto-picked category', () => {
  render(<AutoPickStatus thinking={false} picked={null} rollEmojis={rollEmojis} />)
  expect(screen.getByRole('status').textContent).toBe('')
})

it('says it is picking while thinking, then settles on "Picked for you"', async () => {
  const { rerender } = render(<AutoPickStatus thinking picked={null} rollEmojis={rollEmojis} />)
  expect(screen.getByText(PICKING_LABEL)).toBeTruthy()

  rerender(<AutoPickStatus thinking={false} picked={groceries} rollEmojis={rollEmojis} />)
  // Still rolling down onto the answer.
  expect(screen.getByText(PICKING_LABEL)).toBeTruthy()
  await waitFor(() => expect(screen.getByText(PICKED_LABEL)).toBeTruthy(), SETTLE)
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('🛒'), SETTLE)
})

it('lands a dictionary hit straight away, without the picking state', () => {
  const { rerender } = render(<AutoPickStatus thinking={false} picked={null} rollEmojis={rollEmojis} />)
  rerender(<AutoPickStatus thinking={false} picked={groceries} rollEmojis={rollEmojis} />)
  expect(screen.queryByText(PICKING_LABEL)).toBeNull()
  expect(screen.getByText(PICKED_LABEL)).toBeTruthy()
})

it('keeps the selected category visible after a hand pick', () => {
  const { rerender } = render(<AutoPickStatus thinking={false} picked={groceries} selected={groceries} rollEmojis={rollEmojis} />)
  const rent = { emoji: '🏠', name: 'Rent' }
  rerender(<AutoPickStatus thinking={false} picked={null} selected={rent} rollEmojis={rollEmojis} />)
  expect(screen.getByText('Rent')).toBeInTheDocument()
  expect(screen.getByRole('status').textContent).toContain('🏠')
  expect(screen.queryByText(PICKED_LABEL)).toBeNull()
})

it('goes away when the AI finds nothing or the user picks by hand', async () => {
  const { rerender } = render(<AutoPickStatus thinking picked={null} rollEmojis={rollEmojis} />)
  rerender(<AutoPickStatus thinking={false} picked={null} rollEmojis={rollEmojis} />)
  await waitFor(() => expect(screen.queryByText(PICKING_LABEL)).toBeNull(), SETTLE)

  rerender(<AutoPickStatus thinking={false} picked={groceries} rollEmojis={rollEmojis} />)
  expect(screen.getByText(PICKED_LABEL)).toBeTruthy()
  rerender(<AutoPickStatus thinking={false} picked={null} rollEmojis={rollEmojis} />)
  await waitFor(() => expect(screen.queryByText(PICKED_LABEL)).toBeNull(), SETTLE)
})
