import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, it } from 'vitest'
import { Scrim, Sheet } from './MotionSheet'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <div className="expense-redesign">
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Scrim className="erd-modal-overlay" onClick={() => setOpen(false)}>
          <Sheet className="erd-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Log expense</h3>
            <input aria-label="Amount" autoFocus />
            <button type="button" onClick={() => setOpen(false)}>Done</button>
          </Sheet>
        </Scrim>
      )}
    </div>
  )
}

it('announces a scrim sheet as a modal dialog named by its heading', () => {
  render(<Harness />)
  fireEvent.click(screen.getByText('Open'))
  const dialog = screen.getByRole('dialog', { name: 'Log expense' })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
})

it('closes on Escape and gives focus back to the opener, even with an autoFocus input', () => {
  render(<Harness />)
  const opener = screen.getByText('Open')
  opener.focus()
  fireEvent.click(opener)
  expect(screen.getByLabelText('Amount')).toHaveFocus()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(opener).toHaveFocus()
})

it('keeps Tab inside the dialog', () => {
  render(<Harness />)
  fireEvent.click(screen.getByText('Open'))
  screen.getByText('Done').focus()
  fireEvent.keyDown(document, { key: 'Tab' })
  expect(screen.getByLabelText('Amount')).toHaveFocus()
})
