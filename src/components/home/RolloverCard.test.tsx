import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RolloverCard } from './RolloverCard'

describe('RolloverCard', () => {
  it('replays the roll-in when the line is tapped, without dismissing', async () => {
    const onReplay = vi.fn()
    const onDone = vi.fn()
    render(<RolloverCard text="₹21,700 rolled over · ₹550 short" onReplay={onReplay} onDone={onDone} />)
    await userEvent.click(screen.getByRole('button', { name: /rolled over/ }))
    expect(onReplay).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Got it' })).toBeEnabled()
  })

  it('celebrates only when nothing came in short', () => {
    const { rerender, container } = render(<RolloverCard text="₹21,700 rolled over" onReplay={vi.fn()} onDone={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Nice' })).toBeInTheDocument()
    expect(container.querySelector('.is-short')).toBeNull()
    rerender(<RolloverCard text="₹21,700 rolled over · ₹550 short" onReplay={vi.fn()} onDone={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument()
    expect(container.querySelector('.is-short')).not.toBeNull()
  })
})
