import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { animate as animateValue } from 'motion/react'
import { AutoPickStatus, PICKED_LABEL, PICKING_LABEL } from './AutoPickStatus'
import type { CategoryIconKey } from '@/src/lib/categoryIcons'

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, animate: vi.fn(actual.animate) }
})
afterEach(() => vi.mocked(animateValue).mockClear())

const groceries = { icon: 'ShoppingCart' as const, name: 'Groceries' }
const rollIcons: CategoryIconKey[] = ['Hamburger', 'Taxi', 'ShoppingCart']
// The icons in the pill's slot, including any still animating out.
const slotIcons = () => [...screen.getByRole('status').querySelectorAll('[data-icon]')].map((el) => el.getAttribute('data-icon'))
// Roll decel steps (190 + 250 + 330ms) plus the pill's exit, with slack.
const SETTLE = { timeout: 2000 }

it('shows nothing when there is no auto-picked category', () => {
  render(<AutoPickStatus thinking={false} picked={null} rollIcons={rollIcons} />)
  expect(screen.getByRole('status').textContent).toBe('')
})

it('says it is picking while thinking, then settles on "Picked for you"', async () => {
  const { rerender } = render(<AutoPickStatus thinking picked={null} rollIcons={rollIcons} />)
  expect(screen.getByText(PICKING_LABEL)).toHaveClass('text-shimmer')

  rerender(<AutoPickStatus thinking={false} picked={groceries} rollIcons={rollIcons} />)
  // Still rolling down onto the answer.
  expect(screen.getByText(PICKING_LABEL)).toBeTruthy()
  await waitFor(() => expect(screen.getByText(PICKED_LABEL)).toBeTruthy(), SETTLE)
  expect(screen.getByText(PICKED_LABEL)).not.toHaveClass('text-shimmer')
  await waitFor(() => expect(slotIcons()).toContain('ShoppingCart'), SETTLE)
})

it('lands a dictionary hit straight away, without the picking state', () => {
  const { rerender } = render(<AutoPickStatus thinking={false} picked={null} rollIcons={rollIcons} />)
  rerender(<AutoPickStatus thinking={false} picked={groceries} rollIcons={rollIcons} />)
  expect(screen.queryByText(PICKING_LABEL)).toBeNull()
  expect(screen.getByText(PICKED_LABEL)).toBeTruthy()
})

it('keeps the selected category visible after a hand pick', () => {
  const { rerender } = render(<AutoPickStatus thinking={false} picked={groceries} selected={groceries} rollIcons={rollIcons} />)
  const rent = { icon: 'House' as const, name: 'Rent' }
  rerender(<AutoPickStatus thinking={false} picked={null} selected={rent} rollIcons={rollIcons} />)
  expect(screen.getByText('Rent')).toBeInTheDocument()
  expect(slotIcons()).toContain('House')
  expect(screen.queryByText(PICKED_LABEL)).toBeNull()
})

it('lands a hand pick immediately when it interrupts an auto-pick settling', async () => {
  const { rerender } = render(<AutoPickStatus thinking picked={null} rollIcons={rollIcons} />)
  rerender(<AutoPickStatus thinking={false} picked={groceries} rollIcons={rollIcons} />)
  expect(screen.getByText(PICKING_LABEL)).toBeTruthy()

  rerender(<AutoPickStatus thinking={false} picked={null} selected={{ icon: 'House', name: 'Rent' }} rollIcons={rollIcons} />)
  expect(screen.getByText('Rent')).toBeInTheDocument()
  expect(screen.queryByText(PICKING_LABEL)).toBeNull()
  await waitFor(() => expect(screen.getByRole('status').querySelector('.auto-pick-burst')).toBeTruthy(), SETTLE)
})

it('goes away when the AI finds nothing or the user picks by hand', async () => {
  const { rerender } = render(<AutoPickStatus thinking picked={null} rollIcons={rollIcons} />)
  rerender(<AutoPickStatus thinking={false} picked={null} rollIcons={rollIcons} />)
  await waitFor(() => expect(screen.queryByText(PICKING_LABEL)).toBeNull(), SETTLE)

  rerender(<AutoPickStatus thinking={false} picked={groceries} rollIcons={rollIcons} />)
  expect(screen.getByText(PICKED_LABEL)).toBeTruthy()
  rerender(<AutoPickStatus thinking={false} picked={null} rollIcons={rollIcons} />)
  await waitFor(() => expect(screen.queryByText(PICKED_LABEL)).toBeNull(), SETTLE)
})
