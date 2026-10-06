'use client'

import { useState } from 'react'
import { useCurrency } from '@/src/context/CurrencyContext'

// Twin of Mobile's AmountTicker: each character that changed rolls past its old
// value like an odometer, the whole number flashes mint (up) or coral (down),
// and quick-pick jumps float a +/- delta badge. Unchanged characters sit still.
// All of that is for quick-pick jumps only (delta !== 0): animating every
// keystroke read as jarring while typing, so typed digits just appear.
export function AmountTicker({
  text,
  tick,
  dir,
  delta,
  dimmed,
}: {
  text: string
  tick: number
  dir: 1 | -1
  delta: number
  dimmed: boolean
}) {
  const { formatMoney } = useCurrency()

  // Previous text, kept in state and adjusted during render so slots can diff
  // old vs new (the documented alternative to reading a ref while rendering).
  const [texts, setTexts] = useState({ text, prev: text })
  if (texts.text !== text) setTexts({ text, prev: texts.text })

  const chars = text.split('')
  const prevChars = texts.prev.split('')
  const way = dir >= 0 ? 'amt-up' : 'amt-down'
  const jump = delta !== 0

  return (
    <div
      className={`amt-ticker ${dimmed ? 'is-dim' : jump ? `${way} ${tick % 2 ? 'is-flash-a' : 'is-flash-b'}` : ''}`}
      role="img"
      aria-label={text}
    >
      {jump && (
        <span key={tick} className={`amt-delta ${delta > 0 ? 'amt-up' : 'amt-down'}`} aria-hidden>
          {delta > 0 ? `▲ +${formatMoney(delta)}` : `▼ −${formatMoney(-delta)}`}
        </span>
      )}
      {chars.map((ch, i) => {
        const oldCh = prevChars[prevChars.length - (chars.length - i)] ?? ''
        if (oldCh === ch || tick === 0 || !jump) return <span key={i} className="amt-slot" aria-hidden>{ch}</span>
        const [top, bottom] = dir >= 0 ? [oldCh, ch] : [ch, oldCh]
        return (
          <span key={`${tick}-${i}`} className="amt-slot" aria-hidden>
            <span className={`amt-col ${way}`}>
              <span>{top || ' '}</span>
              <span>{bottom || ' '}</span>
            </span>
          </span>
        )
      })}
    </div>
  )
}
