import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Scrim, Sheet } from './MotionSheet'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function parseISO(value: string): Date | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const key = (d: Date) => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate()
const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
export const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const fmt = (d: Date | null) => (d ? `${d.getDate()} ${SHORT[d.getMonth()]} ${d.getFullYear()}` : '—')
const fmtShort = (d: Date) => `${d.getDate()} ${SHORT[d.getMonth()]}`
/** `YYYY-MM-DD` as `D Mon YYYY`, for chips that show a picked custom date. */
export function formatShort(iso: string): string {
  const d = parseISO(iso)
  return d ? fmt(d) : iso
}

type SingleProps = {
  mode: 'single'
  value: string
  onChange: (value: string) => void
  disableFuture?: boolean
  /** Render the calendar in a popup at every viewport size. */
  popover?: boolean
  popoverOnDesktop?: boolean
  /** Externally-triggered popover: caller owns the trigger button and open state (e.g. a chip). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
  anchorRef?: RefObject<HTMLElement | null>
}
type RangeProps = {
  mode: 'range'
  value: { start: string; end: string }
  onChange: (value: { start: string; end: string }) => void
  disableFuture?: boolean
  popoverOnDesktop?: boolean
}
export type DatePickerProps = SingleProps | RangeProps

interface Cell {
  day: string
  date: Date | null
  disabled: boolean
  isToday: boolean
  isSelected: boolean
  isInRange: boolean
  isEdgeLeft: boolean
  isEdgeRight: boolean
}

function buildCells(view: Date, today: Date, ds: Date | null, de: Date | null, disableFuture: boolean): Cell[] {
  const first = monthStart(view)
  const lead = (first.getDay() + 6) % 7
  const daysIn = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
  const kS = ds ? key(ds) : null
  const kE = de ? key(de) : null
  const kToday = key(today)
  // Blocks future months only; later days in the current month stay pickable.
  const futureMonth = view.getFullYear() > today.getFullYear() || (view.getFullYear() === today.getFullYear() && view.getMonth() > today.getMonth())
  const cells: Cell[] = []
  for (let i = 0; i < lead; i++) {
    cells.push({ day: '', date: null, disabled: true, isToday: false, isSelected: false, isInRange: false, isEdgeLeft: false, isEdgeRight: false })
  }
  for (let day = 1; day <= daysIn; day++) {
    const d = new Date(view.getFullYear(), view.getMonth(), day)
    const k = key(d)
    const future = disableFuture && futureMonth
    const isStart = kS === k
    const isEnd = kE === k
    const inRange = !!kS && !!kE && k > kS && k < kE
    const sel = isStart || isEnd
    cells.push({
      day: String(day),
      date: d,
      disabled: future,
      isToday: k === kToday,
      isSelected: sel,
      isInRange: inRange,
      isEdgeLeft: isStart && !!kE && kE !== kS,
      isEdgeRight: isEnd && !!kS && kE !== kS,
    })
  }
  return cells
}

export function CalendarBody({
  view,
  today,
  draftStart,
  draftEnd,
  disableFuture,
  dir,
  pingKey,
  onPrevMonth,
  onNextMonth,
  onTapDay,
}: {
  view: Date
  today: Date
  draftStart: Date | null
  draftEnd: Date | null
  disableFuture: boolean
  dir: 'next' | 'prev'
  pingKey: number | null
  onPrevMonth: () => void
  onNextMonth: () => void
  onTapDay: (d: Date) => void
}) {
  const cells = buildCells(view, today, draftStart, draftEnd, disableFuture)
  return (
    <>
      <div className="date-picker-nav">
        <button type="button" className="date-picker-nav-btn" onClick={onPrevMonth} aria-label="Previous month">
          ‹
        </button>
        <div className="date-picker-month-label">
          {MONTHS[view.getMonth()]} {view.getFullYear()}
        </div>
        <button type="button" className="date-picker-nav-btn" onClick={onNextMonth} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="date-picker-weekdays">
        {WEEKDAY_SHORT.map((w, i) => (
          <div key={i} className="date-picker-weekday">
            {w}
          </div>
        ))}
      </div>
      <div key={`${view.getFullYear()}-${view.getMonth()}`} className={`date-picker-grid is-${dir}`}>
        {cells.map((c, i) => (
          <div
            key={i}
            className={`date-picker-cell-wrap${c.isInRange ? ' is-inrange' : ''}${c.isEdgeLeft ? ' is-edge-left' : ''}${c.isEdgeRight ? ' is-edge-right' : ''}`}
          >
            {c.date && (
              <button
                type="button"
                disabled={c.disabled}
                onClick={() => onTapDay(c.date!)}
                className={`date-picker-cell${c.isSelected ? ' is-selected' : ''}${c.isToday ? ' is-today' : ''}${
                  c.disabled ? ' is-future' : ''
                }${pingKey === key(c.date) ? ' is-ping' : ''}`}
              >
                {c.day}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

const SINGLE_PRESETS: [string, number][] = [['Today', 0], ['Yesterday', -1], ['A week ago', -7]]
const RANGE_PRESETS: [string, number, boolean][] = [
  ['This month', 0, true],
  ['Last 7 days', 7, false],
  ['Last 30 days', 30, false],
  ['Last 90 days', 90, false],
]

export function DatePicker(props: DatePickerProps) {
  const disableFuture = props.disableFuture ?? true
  const today = new Date()
  const hideTrigger = props.mode === 'single' && !!props.hideTrigger
  const externalAnchor = props.mode === 'single' ? props.anchorRef : undefined
  const controlledOpen = props.mode === 'single' ? props.open : undefined
  const onOpenChangeProp = props.mode === 'single' ? props.onOpenChange : undefined
  const [openState, setOpenState] = useState(false)
  const open = controlledOpen ?? openState
  const setOpen = useCallback(
    (value: boolean) => {
      onOpenChangeProp?.(value)
      if (controlledOpen === undefined) setOpenState(value)
    },
    [onOpenChangeProp, controlledOpen],
  )
  // A caller-owned trigger (hideTrigger) always pops over; there's no inline fallback to size for.
  const [desktopPopover, setDesktopPopover] = useState(false)
  const popoverActive = hideTrigger || (props.mode === 'single' && !!props.popover) || desktopPopover
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number; width: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const initialAnchor = props.mode === 'single' ? parseISO(props.value) ?? today : parseISO(props.value.start) ?? today
  const [view, setView] = useState(() => monthStart(initialAnchor))
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const [pingKey, setPingKey] = useState<number | null>(null)
  const [preset, setPreset] = useState<string | null>(null)

  const currentStart = props.mode === 'single' ? parseISO(props.value) : parseISO(props.value.start)
  const currentEnd = props.mode === 'single' ? currentStart : parseISO(props.value.end)
  const [draftStart, setDraftStart] = useState<Date | null>(currentStart)
  const [draftEnd, setDraftEnd] = useState<Date | null>(currentEnd)

  useEffect(() => {
    if (!props.popoverOnDesktop) return
    const media = window.matchMedia('(min-width: 901px)')
    const sync = () => setDesktopPopover(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [props.popoverOnDesktop])

  useEffect(() => {
    if (!open || !popoverActive) return

    function positionPopover() {
      const rect = (externalAnchor?.current ?? rootRef.current)?.getBoundingClientRect()
      if (!rect) return
      const gap = 28
      const viewportPadding = 16
      // Before the card has painted, guess its height; once it's mounted, use the real one
      // so a flip-above doesn't leave a gap sized for the wrong estimate.
      const height = cardRef.current?.getBoundingClientRect().height || 410
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
      const top = spaceBelow >= height
        ? rect.bottom + gap
        : Math.max(viewportPadding, rect.top - height - gap)
      // A chip anchor is too narrow to size the card by; give it a fixed width and keep it on-screen.
      const width = externalAnchor ? 300 : rect.width
      const left = externalAnchor
        ? Math.min(rect.left, window.innerWidth - width - viewportPadding)
        : rect.left
      setPopoverPosition({ left, top, width })
    }

    positionPopover()
    // Re-run once the card is actually in the DOM so the estimate above gets replaced with its real height.
    const raf = requestAnimationFrame(positionPopover)
    window.addEventListener('resize', positionPopover)
    window.addEventListener('scroll', positionPopover, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', positionPopover)
      window.removeEventListener('scroll', positionPopover, true)
    }
  }, [popoverActive, open, externalAnchor, view])

  useEffect(() => {
    if (!hideTrigger || !open) return
    setDraftStart(currentStart)
    setDraftEnd(currentEnd)
    setView(monthStart(currentStart ?? today))
    // currentStart/currentEnd/today are derived fresh every render; re-run only on open, not on every value tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hideTrigger])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (rootRef.current && rootRef.current.contains(target)) return
      if (externalAnchor?.current && externalAnchor.current.contains(target)) return
      if ((target as HTMLElement).closest?.('.date-picker-scrim, .date-picker-popover')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open, externalAnchor, setOpen])

  function openPicker() {
    setDraftStart(currentStart)
    setDraftEnd(currentEnd)
    setView(monthStart(currentStart ?? today))
    setOpen(true)
  }

  function navMonth(delta: number) {
    setDir(delta > 0 ? 'next' : 'prev')
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1))
  }

  function tapDay(d: Date) {
    setPingKey(key(d))
    setPreset(null)
    if (props.mode === 'single') {
      setDraftStart(d)
      setDraftEnd(d)
      props.onChange(toISO(d))
      setOpen(false)
      return
    }
    setDraftStart((ds) => {
      if (!ds || (ds && draftEnd)) {
        setDraftEnd(null)
        return d
      }
      if (key(d) < key(ds)) {
        setDraftEnd(ds)
        return d
      }
      setDraftEnd(d)
      return ds
    })
  }

  function applyRange(start: Date, end: Date) {
    if (props.mode !== 'range') return
    props.onChange({ start: toISO(start), end: toISO(end) })
    setOpen(false)
  }

  function jumpSingle(d: Date) {
    setPingKey(key(d))
    setDraftStart(d)
    setDraftEnd(d)
    setView(monthStart(d))
    if (props.mode === 'single') {
      props.onChange(toISO(d))
      setOpen(false)
    }
  }

  function setRangePreset(label: string, days: number, useMonthStart: boolean) {
    const end = today
    const start = useMonthStart ? monthStart(today) : addDays(today, -(days - 1))
    setDraftStart(start)
    setDraftEnd(end)
    setPreset(label)
    setView(monthStart(start))
  }

  if (props.mode === 'single') {
    const label = currentStart ? `${WEEKDAY_FULL[currentStart.getDay()]}, ${fmt(currentStart)}` : 'Select a date'
    const calendar = (
      <div ref={cardRef} className={`date-picker-card${popoverActive ? ' date-picker-popover' : ''}`} style={popoverPosition ?? undefined}>
        <div className="date-picker-quick">
          {SINGLE_PRESETS.map(([presetLabel, off]) => {
            const d = addDays(today, off)
            const active = !!draftStart && key(draftStart) === key(d)
            return (
              <button type="button" key={presetLabel} className={`date-picker-chip${active ? ' is-active' : ''}`} onClick={() => jumpSingle(d)}>
                {presetLabel}
              </button>
            )
          })}
        </div>
        <CalendarBody
          view={view}
          today={today}
          draftStart={draftStart}
          draftEnd={draftStart}
          disableFuture={disableFuture}
          dir={dir}
          pingKey={pingKey}
          onPrevMonth={() => navMonth(-1)}
          onNextMonth={() => navMonth(1)}
          onTapDay={tapDay}
        />
      </div>
    )
    if (hideTrigger) {
      return (
        <div ref={rootRef}>
          {open && popoverPosition && createPortal(calendar, document.querySelector('.expense-redesign') ?? document.body)}
        </div>
      )
    }
    return (
      <div className="date-picker-field-wrap" ref={rootRef}>
        <button type="button" className="date-picker-field" onClick={() => (open ? setOpen(false) : openPicker())}>
          <span className="date-picker-field-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="3" />
              <path d="M3 10h18" />
              <path d="M8 3v4" />
              <path d="M16 3v4" />
            </svg>
          </span>
          <span className="date-picker-field-text">{label}</span>
          <span className={`date-picker-field-caret${open ? ' is-open' : ''}`} aria-hidden="true">
            ⌄
          </span>
        </button>
        {open && (!popoverActive || popoverPosition) && (
          popoverActive
            ? createPortal(calendar, document.querySelector('.expense-redesign') ?? document.body)
            : calendar
        )}
      </div>
    )
  }

  const rangeLabel =
    currentStart && currentEnd
      ? key(currentStart) === key(currentEnd)
        ? fmt(currentStart)
        : `${fmtShort(currentStart)} – ${fmtShort(currentEnd)}`
      : 'Select dates'
  const days = currentStart && currentEnd ? Math.round((currentEnd.getTime() - currentStart.getTime()) / 86400000) + 1 : 0
  const draftDays = draftStart && draftEnd ? Math.round((draftEnd.getTime() - draftStart.getTime()) / 86400000) + 1 : draftStart ? 1 : 0
  const applyDisabled = !draftStart || !draftEnd

  return (
    <div className="date-picker-field-wrap" ref={rootRef}>
      <button type="button" className="date-picker-trigger" onClick={() => (open ? setOpen(false) : openPicker())}>
        <span className="date-picker-field-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M3 10h18" />
            <path d="M8 3v4" />
            <path d="M16 3v4" />
          </svg>
        </span>
        <span className="date-picker-trigger-text">
          <span className="date-picker-trigger-caption">DATE RANGE</span>
          <span className="date-picker-trigger-label">{rangeLabel}</span>
        </span>
        {days > 0 && <span className="date-picker-trigger-span">{days} {days === 1 ? 'day' : 'days'}</span>}
      </button>

      {open && (
        <Scrim className="date-picker-scrim" onClick={() => setOpen(false)}>
          <Sheet className="date-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="date-picker-sheet-header">
              <div>
                <div className="date-picker-sheet-title">Pick a range</div>
                <div className="date-picker-sheet-sub">
                  {draftStart && !draftEnd ? 'Now tap the end day' : draftDays > 0 ? `${draftDays} days selected` : 'Tap a day'}
                </div>
              </div>
              <button type="button" className="date-picker-sheet-close" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="date-picker-quick">
              {RANGE_PRESETS.map(([label, n, useMonthStart]) => (
                <button
                  type="button"
                  key={label}
                  className={`date-picker-chip${preset === label ? ' is-active' : ''}`}
                  onClick={() => setRangePreset(label, n, useMonthStart)}
                >
                  {label}
                </button>
              ))}
            </div>

            <CalendarBody
              view={view}
              today={today}
              draftStart={draftStart}
              draftEnd={draftEnd}
              disableFuture={disableFuture}
              dir={dir}
              pingKey={pingKey}
              onPrevMonth={() => navMonth(-1)}
              onNextMonth={() => navMonth(1)}
              onTapDay={tapDay}
            />

            <div className="date-picker-summary">
              <div className="date-picker-summary-item">
                <span className="date-picker-summary-label">FROM</span>
                <span className="date-picker-summary-value">{fmt(draftStart)}</span>
              </div>
              <div className="date-picker-summary-divider" />
              <div className="date-picker-summary-item">
                <span className="date-picker-summary-label">TO</span>
                <span className="date-picker-summary-value">{fmt(draftEnd)}</span>
              </div>
            </div>

            <div className="date-picker-footer">
              <button
                type="button"
                className="date-picker-clear"
                onClick={() => {
                  setDraftStart(null)
                  setDraftEnd(null)
                  setPreset(null)
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="date-picker-apply"
                disabled={applyDisabled}
                onClick={() => draftStart && draftEnd && applyRange(draftStart, draftEnd)}
              >
                {applyDisabled ? 'Select dates' : `Show ${draftDays} ${draftDays === 1 ? 'day' : 'days'}`}
              </button>
            </div>
          </Sheet>
        </Scrim>
      )}
    </div>
  )
}
