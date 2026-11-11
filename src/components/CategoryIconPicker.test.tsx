import { describe, it, expect } from 'vitest'
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
})
