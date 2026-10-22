import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CATEGORY_ICONS } from '@/src/lib/categoryIcons'
import { CATEGORY_ICON_PATHS } from './categoryIconPaths'
import { CategoryIcon } from './CategoryIcon'

describe('category icon paths', () => {
  it('has a path for every catalog icon (run npm run gen:category-icons)', () => {
    const missing = Object.keys(CATEGORY_ICONS).filter((key) => !CATEGORY_ICON_PATHS[key])
    expect(missing).toEqual([])
  })

  it('draws a category inline, with nothing to fetch', () => {
    const { container } = render(<CategoryIcon name="🏠 Rent" size={20} />)
    expect(container.querySelector('path')?.getAttribute('d')).toBe(CATEGORY_ICON_PATHS.House)
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('20')
  })
})
