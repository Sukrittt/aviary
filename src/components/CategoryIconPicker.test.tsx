import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CategoryIconPicker } from './CategoryIconPicker'

const tint = { background: '#dfe', color: '#286' }

describe('CategoryIconPicker', () => {
  it('marks the tile as editable even with a name input beside it', () => {
    render(
      <CategoryIconPicker value="Tote" onChange={() => {}} tint={tint}>
        <input aria-label="Name" />
      </CategoryIconPicker>,
    )
    const tile = screen.getByRole('button', { name: /Change icon/ })
    expect(tile.querySelector('.cat-icon-picker-badge')).not.toBeNull()
  })

  it('bounces the tile when a new icon is picked, with the colour unchanged', () => {
    const animate = vi.fn()
    HTMLElement.prototype.animate = animate
    const { rerender } = render(<CategoryIconPicker value="Tote" onChange={() => {}} tint={tint} />)
    expect(animate).not.toHaveBeenCalled()
    rerender(<CategoryIconPicker value="Dog" onChange={() => {}} tint={tint} />)
    expect(animate).toHaveBeenCalledTimes(1)
  })
})
