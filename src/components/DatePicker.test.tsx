import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { DatePicker } from './DatePicker'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 7, 22)) // Sat 22 Aug 2026
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function ControlledSingle({ onChange }: { onChange: (v: string) => void }) {
  const [value, setValue] = useState('2026-08-19')
  return (
    <DatePicker
      mode="single"
      value={value}
      onChange={(v) => {
        setValue(v)
        onChange(v)
      }}
    />
  )
}

it('allows a later day in the current month but blocks days in a future month', () => {
  const onChange = vi.fn()
  render(<ControlledSingle onChange={onChange} />)
  fireEvent.click(screen.getByText('Wednesday, 19 Aug 2026'))

  // 25 Aug is after "today" (22 Aug) but still the current month: pickable.
  fireEvent.click(screen.getByText('25'))
  expect(onChange).toHaveBeenCalledWith('2026-08-25')

  // Single-select closes the card on pick; reopen it to navigate months.
  onChange.mockClear()
  fireEvent.click(screen.getByText('Tuesday, 25 Aug 2026'))
  fireEvent.click(screen.getByLabelText('Next month')) // nav to September 2026
  expect(screen.getByText('September 2026')).toBeTruthy()
  const septFifth = screen.getByText('5').closest('button')!
  expect(septFifth).toBeDisabled()
  fireEvent.click(septFifth)
  expect(onChange).not.toHaveBeenCalled()
})

it('renders a single-date calendar as a desktop popover when requested', () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))

  render(
    <div className="expense-redesign">
      <DatePicker
        mode="single"
        value="2026-08-19"
        onChange={vi.fn()}
        popoverOnDesktop
      />
    </div>,
  )

  fireEvent.click(screen.getByText('Wednesday, 19 Aug 2026'))

  const popover = screen.getByText('August 2026').closest('.date-picker-popover')
  expect(popover).toBeTruthy()
  expect(popover?.parentElement).toHaveClass('expense-redesign')
})

function ChipTriggeredSingle({ onChange }: { onChange: (v: string) => void }) {
  const [value, setValue] = useState('2026-08-19')
  const [open, setOpen] = useState(false)
  const chipRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="expense-redesign">
      <button type="button" ref={chipRef} onClick={() => setOpen((v) => !v)}>
        Pick date
      </button>
      <DatePicker
        mode="single"
        value={value}
        onChange={(v) => {
          setValue(v)
          onChange(v)
        }}
        hideTrigger
        open={open}
        onOpenChange={setOpen}
        anchorRef={chipRef}
      />
    </div>
  )
}

it('renders a chip-triggered calendar as a popover with no inline field, and closes on pick', () => {
  const onChange = vi.fn()
  render(<ChipTriggeredSingle onChange={onChange} />)

  expect(screen.queryByText('Wednesday, 19 Aug 2026')).toBeNull()

  fireEvent.click(screen.getByText('Pick date'))
  const popover = screen.getByText('August 2026').closest('.date-picker-popover')
  expect(popover).toBeTruthy()

  fireEvent.click(screen.getByText('25'))
  expect(onChange).toHaveBeenCalledWith('2026-08-25')
  expect(screen.queryByText('August 2026')).toBeNull()
})


it('opens a popup on small screens when requested and closes after selecting a date', () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  const onChange = vi.fn()
  render(
    <div className="expense-redesign">
      <aside className="scan-side">
        <DatePicker mode="single" value="2026-08-19" onChange={onChange} popover />
      </aside>
    </div>,
  )
  fireEvent.click(screen.getByText('Wednesday, 19 Aug 2026'))
  const calendar = screen.getByText('August 2026').closest('.date-picker-popover')
  expect(calendar).toBeInTheDocument()
  expect(calendar?.closest('.scan-side')).toBeNull()
  fireEvent.click(screen.getByText('25'))
  expect(onChange).toHaveBeenCalledWith('2026-08-25')
  expect(screen.queryByText('August 2026')).toBeNull()
})


it('anchors above the field using the untransformed height on the first open and reopen', () => {
  const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('date-picker-field-wrap')
      ? { top: 600, bottom: 650, left: 100, right: 420, width: 320, height: 50 } as DOMRect
      : { top: 0, bottom: 410, left: 0, right: 320, width: 320, height: 410 } as DOMRect
  })
  const heightSpy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(320)
  try {
    render(<DatePicker mode="single" value="2026-08-19" onChange={vi.fn()} popover />)
    const trigger = screen.getByText('Wednesday, 19 Aug 2026')
    fireEvent.click(trigger)
    expect(screen.getByText('August 2026').closest('.date-picker-popover')).toHaveStyle({ top: '272px' })
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    expect(screen.getByText('August 2026').closest('.date-picker-popover')).toHaveStyle({ top: '272px' })
  } finally {
    rectSpy.mockRestore()
    heightSpy.mockRestore()
  }
})
