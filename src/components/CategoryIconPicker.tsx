'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CATEGORY_ICON_COMPONENTS } from './CategoryIcon'
import { CheckIcon, MagnifyingGlassIcon, PencilSimpleIcon } from './icons'
import { searchCategoryIcons, type CategoryIconKey } from '@/src/lib/categoryIcons'
import { CATEGORY_COLORS, type CategoryColor } from '@/src/lib/categoryColors'
import { colorStyle } from '@/src/lib/emoji'

const POPOVER_WIDTH = 320
// Search row plus four rows of icons, for deciding whether it fits below.
const POPOVER_HEIGHT = 280
const GAP = 8
const EDGE = 12

/** "ForkKnife" → "Fork knife", for labels and tooltips. */
export function iconLabel(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The tile beside a category's name: shows its icon on its tint, and opens a
 * popover with a searchable grid of every catalog icon. The popover is
 * portalled and fixed, like Select's menu, since the sheets it opens from
 * scroll and would clip it.
 */
export function CategoryIconPicker({ value, onChange, tint, disabled, className, children }: {
  value: CategoryIconKey
  onChange: (key: CategoryIconKey) => void
  /** The tile's background and icon colour, from avatarStyleFor(). */
  tint: { background: string; color: string }
  disabled?: boolean
  /** Extra class for the tile, to size it where it sits. */
  className?: string
  /** The name input, laid out beside the tile. Without it, just the tile. */
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState<{ top: number; left: number; above: boolean } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const Current = CATEGORY_ICON_COMPONENTS[value]
  const matches = searchCategoryIcons(query)

  // Below the tile, or above it when there isn't room; kept inside the viewport.
  const measure = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - EDGE * 2)
    const above = window.innerHeight - r.bottom < POPOVER_HEIGHT + GAP + EDGE && r.top > window.innerHeight - r.bottom
    setPlace({
      top: above ? r.top - GAP : r.bottom + GAP,
      left: Math.max(EDGE, Math.min(r.left, window.innerWidth - width - EDGE)),
      above,
    })
  }, [])

  // Dismiss on an outside press or an outer scroll (a fixed popover would
  // otherwise float away from its tile); follow the tile on resize.
  useEffect(() => {
    if (!open) return
    const inside = (t: EventTarget | null) =>
      panel.current?.contains(t as Node) || trigger.current?.contains(t as Node)
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target)) setOpen(false)
    }
    const onScroll = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, measure])

  function pick(key: CategoryIconKey) {
    onChange(key)
    setOpen(false)
    setQuery('')
    trigger.current?.focus()
  }

  const triggerButton = (
    <button
      ref={trigger}
      type="button"
      className={`cat-icon-picker-trigger${className ? ` ${className}` : ''}`}
      style={tint}
      disabled={disabled}
      aria-label={`Icon: ${iconLabel(value)}. Change icon`}
      aria-expanded={open}
      aria-controls={panelId}
      title="Change icon"
      onClick={() => {
        if (!open) measure()
        setOpen(!open)
      }}
    >
      <Current size="1em" aria-hidden />
      {/* A standalone tile has no input beside it to say it's editable. */}
      {!children && (
        <span className="cat-icon-picker-badge" aria-hidden="true">
          <PencilSimpleIcon size={11} weight="bold" />
        </span>
      )}
    </button>
  )

  return (
    <div
      className="cat-icon-picker"
      onKeyDown={(e) => {
        // The sheet closes on Escape too; only the popover should close here.
        // (React events bubble out of the portal to here.)
        if (e.key === 'Escape' && open) {
          e.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      {children ? (
        <div className="env-sheet-name-row">
          {triggerButton}
          {children}
        </div>
      ) : (
        triggerButton
      )}
      {open && place && createPortal(
        <div
          ref={panel}
          className={`cat-icon-picker-panel${place.above ? ' is-above' : ''}`}
          id={panelId}
          role="dialog"
          aria-label="Choose an icon"
          style={{
            left: place.left,
            ...(place.above ? { bottom: window.innerHeight - place.top } : { top: place.top }),
          }}
        >
          <label className="cat-icon-picker-search">
            <MagnifyingGlassIcon size={16} aria-hidden />
            <input
              autoFocus
              placeholder="Search icons"
              aria-label="Search icons"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter would submit the surrounding form; pick the first match instead.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (matches[0]) pick(matches[0])
                }
              }}
            />
          </label>
          {matches.length ? (
            <div className="cat-icon-picker-grid">
              {matches.map((key) => {
                const Icon = CATEGORY_ICON_COMPONENTS[key]
                return (
                  <button
                    type="button"
                    key={key}
                    className={`cat-icon-picker-option${key === value ? ' is-on' : ''}`}
                    aria-label={iconLabel(key)}
                    aria-pressed={key === value}
                    title={iconLabel(key)}
                    onClick={() => pick(key)}
                  >
                    <Icon size={20} aria-hidden />
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="cat-icon-picker-empty">No icons match that. Try another word.</p>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

const COLOR_LABELS: Record<CategoryColor, string> = {
  mint: 'Green', violet: 'Purple', blue: 'Blue', accent: 'Orange', warn: 'Yellow', coral: 'Red',
}

/** A row of the six tints, for picking a category's or group's colour. */
export function ColorSwatches({ value, onChange, disabled }: {
  value: CategoryColor
  onChange: (color: CategoryColor) => void
  disabled?: boolean
}) {
  return (
    <div className="color-swatches" role="radiogroup" aria-label="Color">
      {CATEGORY_COLORS.map((color) => {
        const { background, color: ink } = colorStyle(color)
        const on = color === value
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={COLOR_LABELS[color]}
            title={COLOR_LABELS[color]}
            className="color-swatch"
            style={{ background, borderColor: on ? ink : 'transparent' }}
            onClick={() => onChange(color)}
            disabled={disabled}
          >
            <span className="color-swatch-dot" style={{ background: ink }}>
              {on && <CheckIcon size={13} weight="bold" aria-hidden="true" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
