'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import './Select.css'

export interface SelectOption {
  value: string
  label: string
  /** Muted second line, e.g. a balance or a code. */
  hint?: string
  /** Leading glyph, e.g. a category emoji — shown in both the trigger and the row. */
  icon?: string
  disabled?: boolean
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Shown when `value` matches no option (e.g. the empty "Assign to" state). */
  placeholder?: string
  'aria-label'?: string
  id?: string
  disabled?: boolean
  className?: string
  /** Adds a search box pinned to the top of the menu that filters by label. */
  searchable?: boolean
}

const MAX_MENU_HEIGHT = 280
const GAP = 6
const EDGE = 12
const MIN_MENU_WIDTH = 220

interface Placement {
  top: number
  left: number
  width: number
  maxHeight: number
  above: boolean
}

/**
 * Themed replacement for the native `<select>` — the menu is a portalled,
 * fixed-position listbox so modals with `overflow: auto` never clip it, and it
 * flips above the trigger when there is no room below. Keyboard: arrows / Home /
 * End move, Enter / Space pick, Escape closes, typing jumps to a match (or,
 * with `searchable`, filters the list instead).
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  'aria-label': ariaLabel,
  id,
  disabled = false,
  className = '',
  searchable = false,
}: Props) {
  const listId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const typeahead = useRef({ text: '', at: 0 })
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [place, setPlace] = useState<Placement | null>(null)
  const [search, setSearch] = useState('')

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null

  const q = search.trim().toLowerCase()
  const shown = useMemo(
    () => (searchable && q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options),
    [searchable, q, options],
  )

  const measure = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - GAP - EDGE
    const above = r.top - GAP - EDGE
    const flip = below < 160 && above > below
    const maxHeight = Math.max(120, Math.min(MAX_MENU_HEIGHT, flip ? above : below))
    // A small trigger (a chip) still gets a menu wide enough to read its options.
    const width = Math.min(Math.max(r.width, MIN_MENU_WIDTH), window.innerWidth - EDGE * 2)
    setPlace({
      top: flip ? r.top - GAP : r.bottom + GAP,
      left: Math.max(EDGE, Math.min(r.left, window.innerWidth - width - EDGE)),
      width,
      maxHeight,
      above: flip,
    })
  }, [])

  const openMenu = useCallback(() => {
    if (disabled) return
    setSearch('')
    const firstEnabled = options.findIndex((o) => !o.disabled)
    setActive(selectedIndex >= 0 ? selectedIndex : firstEnabled)
    setOpen(true)
  }, [disabled, options, selectedIndex])

  const close = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }, [])

  const pick = useCallback((i: number) => {
    const opt = shown[i]
    if (!opt || opt.disabled) return
    onChange(opt.value)
    close()
  }, [shown, onChange, close])

  useLayoutEffect(() => {
    if (open) measure()
  }, [open, measure])

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus()
  }, [open, searchable])

  // Search text can shrink the list out from under the stored active index —
  // derive the resolved one instead of syncing it back with an effect.
  const resolvedActive = active >= 0 && !shown[active]?.disabled ? active : shown.findIndex((o) => !o.disabled)

  // Dismiss on outside press; follow the trigger on resize, but close on any
  // outer scroll (a fixed menu would otherwise float away from its trigger).
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      close(false)
    }
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return
      close(false)
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, close, measure])

  useEffect(() => {
    if (!open || resolvedActive < 0) return
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${resolvedActive}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, resolvedActive, place])

  function step(list: SelectOption[], from: number, dir: 1 | -1) {
    for (let i = from + dir; i >= 0 && i < list.length; i += dir) {
      if (!list[i].disabled) return i
    }
    return from
  }

  function onMenuKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive(step(shown, resolvedActive, 1)); break
      case 'ArrowUp': e.preventDefault(); setActive(step(shown, resolvedActive, -1)); break
      case 'Home': if (!searchable) { e.preventDefault(); setActive(step(shown, -1, 1)) } break
      case 'End': if (!searchable) { e.preventDefault(); setActive(step(shown, shown.length, -1)) } break
      case 'Enter': e.preventDefault(); pick(resolvedActive); break
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break
      case 'Tab': close(false); break
      case ' ':
        if (!searchable) { e.preventDefault(); pick(resolvedActive) }
        break
      default: {
        if (searchable || e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return
        const now = Date.now()
        const t = typeahead.current
        t.text = now - t.at > 600 ? e.key.toLowerCase() : t.text + e.key.toLowerCase()
        t.at = now
        const hit = shown.findIndex((o) => !o.disabled && o.label.toLowerCase().includes(t.text))
        if (hit >= 0) setActive(hit)
      }
    }
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openMenu()
      }
      return
    }
    onMenuKeyDown(e)
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-activedescendant={open && resolvedActive >= 0 ? `${listId}-${resolvedActive}` : undefined}
        disabled={disabled}
        className={`ui-select${open ? ' is-open' : ''}${selected ? '' : ' is-placeholder'}${className ? ` ${className}` : ''}`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="ui-select-value">
          {selected?.icon && <span className="ui-select-icon" aria-hidden="true">{selected.icon}</span>}
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="ui-select-chevron" size={16} aria-hidden="true" />
      </button>
      {open && place && createPortal(
        <div
          ref={menuRef}
          className={`ui-select-menu${place.above ? ' is-above' : ''}`}
          style={{
            left: place.left,
            width: place.width,
            maxHeight: place.maxHeight,
            ...(place.above ? { bottom: window.innerHeight - place.top } : { top: place.top }),
          }}
        >
          {searchable && (
            <div className="ui-select-search">
              <Search size={14} aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={onMenuKeyDown}
                placeholder="Search…"
                aria-label={ariaLabel ? `Search ${ariaLabel}` : 'Search'}
                aria-controls={listId}
                aria-activedescendant={resolvedActive >= 0 ? `${listId}-${resolvedActive}` : undefined}
              />
            </div>
          )}
          <div id={listId} role="listbox" aria-label={ariaLabel} className="ui-select-options">
            {shown.length === 0 && <div className="ui-select-empty">{q ? 'No matches' : 'No options'}</div>}
            {shown.map((o, i) => (
              <div
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                data-index={i}
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                className={`ui-select-option${i === resolvedActive ? ' is-active' : ''}${o.value === value ? ' is-selected' : ''}`}
                // mousedown, not click: keeps focus on the trigger (or search input).
                onMouseDown={(e) => { e.preventDefault(); pick(i) }}
                onMouseMove={() => !o.disabled && setActive(i)}
              >
                <span className="ui-select-option-main">
                  {o.icon && <span className="ui-select-icon" aria-hidden="true">{o.icon}</span>}
                  <span className="ui-select-option-text">
                    {o.label}
                    {o.hint && <small>{o.hint}</small>}
                  </span>
                </span>
                {o.value === value && <Check size={15} aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
