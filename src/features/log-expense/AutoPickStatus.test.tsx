import { it, expect, vi, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { animate as animateValue } from 'motion/react'
import { AutoPickStatus, PICKED_LABEL, PICKING_LABEL } from './AutoPickStatus'

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, animate: vi.fn(actual.animate) }
})
afterEach(() => vi.mocked(animateValue).mockClear())

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

it('lands a hand pick immediately when it interrupts an auto-pick settling', async () => {
  const { rerender } = render(<AutoPickStatus thinking picked={null} rollEmojis={rollEmojis} />)
  rerender(<AutoPickStatus thinking={false} picked={groceries} rollEmojis={rollEmojis} />)
  expect(screen.getByText(PICKING_LABEL)).toBeTruthy()

  rerender(<AutoPickStatus thinking={false} picked={null} selected={{ emoji: '🏠', name: 'Rent' }} rollEmojis={rollEmojis} />)
  expect(screen.getByText('Rent')).toBeInTheDocument()
  expect(screen.queryByText(PICKING_LABEL)).toBeNull()
  await waitFor(() => expect(screen.getByRole('status').querySelector('.auto-pick-burst')).toBeTruthy(), SETTLE)
})

it('waits for the width animation to finish before showing the splash', () => {
  let finishWidth: () => void = () => {}
  const { rerender } = render(<AutoPickStatus thinking={false} picked={groceries} rollEmojis={rollEmojis} />)
  vi.mocked(animateValue).mockImplementationOnce((_value, _target, options) => {
    finishWidth = options!.onComplete!
    return { stop: vi.fn() } as unknown as ReturnType<typeof animateValue>
  })
  rerender(<AutoPickStatus thinking={false} picked={null} selected={{ emoji: '🏠', name: 'Rent' }} rollEmojis={rollEmojis} />)
  expect(screen.getByRole('status').querySelector('.auto-pick-burst')).toBeNull()
  act(() => finishWidth())
  expect(screen.getByRole('status').querySelector('.auto-pick-burst')).toBeTruthy()
})

it('visibly plays the lines after a manual selection finishes resizing', async () => {
  let finishWidth: () => void = () => {}
  const { rerender } = render(<AutoPickStatus thinking={false} picked={groceries} rollEmojis={rollEmojis} />)
  vi.mocked(animateValue).mockImplementationOnce((_value, _target, options) => {
    finishWidth = options!.onComplete!
    return { stop: vi.fn() } as unknown as ReturnType<typeof animateValue>
  })
  rerender(<AutoPickStatus thinking={false} picked={null} selected={{ emoji: '🛟', name: 'Emergency fund' }} pickTick={1} rollEmojis={rollEmojis} />)
  expect(screen.getByRole('status').querySelector('.auto-pick-burst')).toBeNull()
  act(() => finishWidth())
  await waitFor(() => {
    const line = screen.getByRole('status').querySelector<HTMLElement>('.auto-pick-burst > span > span')!
    expect(Number(line.style.opacity)).toBeGreaterThan(0.1)
  }, { timeout: 1000, interval: 10 })
})

it('ignores a superseded width animation completion', () => {
  const completions: (() => void)[] = []
  const holdWidth = (_value: unknown, _target: unknown, options?: { onComplete?: () => void }) => {
    completions.push(options!.onComplete!)
    return { stop: vi.fn() } as unknown as ReturnType<typeof animateValue>
  }
  const { rerender } = render(<AutoPickStatus thinking={false} picked={groceries} rollEmojis={rollEmojis} />)
  vi.mocked(animateValue).mockImplementationOnce(holdWidth).mockImplementationOnce(holdWidth)
  rerender(<AutoPickStatus thinking={false} picked={null} selected={{ emoji: '🏠', name: 'Rent' }} rollEmojis={rollEmojis} />)
  rerender(<AutoPickStatus thinking={false} picked={null} selected={{ emoji: '🚕', name: 'Travel' }} rollEmojis={rollEmojis} />)
  act(() => completions[0]())
  expect(screen.getByRole('status').querySelector('.auto-pick-burst')).toBeNull()
  act(() => completions[1]())
  expect(screen.getByRole('status').querySelector('.auto-pick-burst')).toBeTruthy()
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
