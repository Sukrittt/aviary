import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Pop } from './Pop'

describe('Pop', () => {
  it('stays still on mount and pops only when its value changes', () => {
    const animate = vi.fn()
    HTMLElement.prototype.animate = animate
    const { rerender } = render(<Pop value="mint" />)
    expect(animate).not.toHaveBeenCalled()
    rerender(<Pop value="mint" />)
    expect(animate).not.toHaveBeenCalled()
    rerender(<Pop value="coral" />)
    expect(animate).toHaveBeenCalledTimes(1)
  })
})
