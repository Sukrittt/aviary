import { createRef } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DeletingRow } from './DeletingRow'

describe('DeletingRow', () => {
  // AnimatePresence popLayout clones a ref onto the row to measure it and pin it
  // out of flow while it exits. Dropping that ref leaves the row in flow, so the
  // rows below jump instead of springing up.
  it('forwards the ref popLayout needs to the row element', () => {
    const ref = createRef<HTMLDivElement & HTMLLIElement>()
    render(
      <DeletingRow ref={ref} as="li" className="row" active={false} onDone={() => {}}>
        Fuel
      </DeletingRow>,
    )
    expect(ref.current?.tagName).toBe('LI')
    expect(ref.current?.className).toContain('row')
  })
})
