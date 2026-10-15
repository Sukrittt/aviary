import { render, screen } from '@testing-library/react'
import { HouseIcon, ReceiptIcon } from '@/src/components/icons'
import { describe, expect, it, vi } from 'vitest'
import { FloatingNav } from './nav'

const pathsOf = (el: Element) => [...el.querySelectorAll('path')].map((p) => p.getAttribute('d'))
const glyph = (node: React.ReactElement) => pathsOf(render(node).container)

describe('FloatingNav', () => {
  it('fills the active tab glyph and leaves the rest regular', () => {
    const fill = glyph(<ReceiptIcon weight="fill" />)
    const regular = glyph(<HouseIcon weight="regular" />)
    render(<FloatingNav active="activity" onSelect={vi.fn()} onAdd={vi.fn()} />)
    expect(pathsOf(screen.getByLabelText('Activity'))).toEqual(fill)
    expect(pathsOf(screen.getByLabelText('Home'))).toEqual(regular)
  })

  it('keeps the four tabs in the pill and add outside it, as its own button', () => {
    render(<FloatingNav active={null} addActive onSelect={vi.fn()} onAdd={vi.fn()} />)
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual(['Home', 'Activity', 'Categories', 'More'])
    expect(screen.getByRole('tablist')).not.toContainElement(screen.getByRole('button', { name: 'Log expense' }))
  })
})
