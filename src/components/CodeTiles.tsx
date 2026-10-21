'use client'

import { useEffect, useRef, useState } from 'react'

const CASCADE_MS = 45
const SHAKE: Keyframe[] = [-9, 9, -6, 6, -3, 0].map((x) => ({ transform: `translateX(${x}px)` }))

/**
 * A code typed into one tile per character. Twin of Mobile's CodeTiles: a real
 * input sits over the tiles, invisible, so typing, paste and autofill all work.
 * A letter pops into its tile, a pasted code fills left to right, and the row
 * shakes each time `shakeFor` changes to something new (the code that didn't match).
 */
export function CodeTiles({ id, value, onChange, length, error, shakeFor = '', autoFocus }: {
  id: string
  value: string
  onChange: (text: string) => void
  length: number
  error?: boolean
  shakeFor?: string
  autoFocus?: boolean
}) {
  const row = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  // Where the last change started, so a paste cascades from there.
  const [from, setFrom] = useState(0)

  useEffect(() => {
    if (!shakeFor || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    row.current?.animate?.(SHAKE, { duration: 300, easing: 'ease-out' })
  }, [shakeFor])

  const active = Math.min(value.length, length - 1)
  return (
    <div className="code-tiles" ref={row}>
      {Array.from({ length }, (_, i) => (
        <span key={i} data-testid={`code-tile-${i}`} className={`code-tile${error ? ' is-error' : focused && i === active ? ' is-active' : ''}`} aria-hidden="true">
          {value[i] && (
            <span key={value[i]} className="code-tile-char" style={{ animationDelay: `${Math.max(0, i - from) * CASCADE_MS}ms` }}>
              {value[i]}
            </span>
          )}
        </span>
      ))}
      <input
        id={id}
        className="code-tiles-input"
        value={value}
        maxLength={length}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setFrom(value.length)
          onChange(e.target.value)
        }}
      />
    </div>
  )
}
