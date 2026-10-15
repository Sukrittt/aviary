import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CATEGORY_ICONS } from '@/src/lib/categoryIcons'
import { CATEGORY_ICON_SPRITE } from './categoryIconSprite'
import { CategoryIcon } from './CategoryIcon'

const sprite = readFileSync('public/category-icons.svg', 'utf8')

describe('category icon sprite', () => {
  it('has a symbol for every catalog icon (run npm run gen:category-icons)', () => {
    const missing = Object.keys(CATEGORY_ICONS).filter((key) => !sprite.includes(`<symbol id="${key}"`))
    expect(missing).toEqual([])
  })

  it('is linked by its current content hash, so the long cache never serves a stale sprite', () => {
    const hash = createHash('sha256').update(sprite).digest('hex').slice(0, 10)
    expect(CATEGORY_ICON_SPRITE).toBe(`/category-icons.svg?v=${hash}`)
  })

  it('draws a category from the sprite', () => {
    const { container } = render(<CategoryIcon name="🏠 Rent" size={20} />)
    expect(container.querySelector('use')?.getAttribute('href')).toBe(`${CATEGORY_ICON_SPRITE}#House`)
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('20')
  })
})
