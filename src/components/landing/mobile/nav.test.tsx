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
    render(<FloatingNav active="activity" onSelect={vi.fn(() => true)} onAdd={vi.fn()} />)
    expect(pathsOf(screen.getByLabelText('Activity'))).toEqual(fill)
    expect(pathsOf(screen.getByLabelText('Home'))).toEqual(regular)
  })
})
