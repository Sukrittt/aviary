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
    expect(screen.getByRole('button', { name: 'Nice' })).toBeEnabled()
  })
})
