'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CATEGORY_ICON_COMPONENTS } from './CategoryIcon'
import { CaretDownIcon, MagnifyingGlassIcon } from './icons'
import { searchCategoryIcons, type CategoryIconKey } from '@/src/lib/categoryIcons'

/** "ForkKnife" → "Fork knife", for labels and tooltips. */
export function iconLabel(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The tile beside a category's name: shows its icon on its tint, and opens a
 * searchable grid of every catalog icon below the name row. In flow rather
 * than floating, since the sheets it lives in scroll and would clip it.
 */
export function CategoryIconPicker({ value, onChange, tint, disabled, children }: {
  value: CategoryIconKey
  onChange: (key: CategoryIconKey) => void
  /** The tile's background and icon colour, from avatarStyleFor(). */
  tint: { background: string; color: string }
  disabled?: boolean
  /** The name input, laid out beside the tile. */
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const Current = CATEGORY_ICON_COMPONENTS[value]
  const matches = searchCategoryIcons(query)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function pick(key: CategoryIconKey) {
    onChange(key)
    setOpen(false)
    setQuery('')
  }

  return (
    <div
      className="cat-icon-picker"
      ref={root}
      onKeyDown={(e) => {
        // The sheet closes on Escape too; only the panel should close here.
        if (e.key === 'Escape' && open) {
          e.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <div className="env-sheet-name-row">
        <button
          type="button"
          className="cat-icon-picker-trigger"
          style={tint}
          disabled={disabled}
          aria-label={`Icon: ${iconLabel(value)}. Change icon`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          <Current size={20} aria-hidden />
          <CaretDownIcon size={10} weight="bold" className="cat-icon-picker-caret" aria-hidden />
        </button>
        {children}
      </div>
      {open && (
        <div className="cat-icon-picker-panel" id={panelId} role="dialog" aria-label="Choose an icon">
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
        </div>
      )}
    </div>
  )
}
