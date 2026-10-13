'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ENVELOPE_SPRING, SpringCollapse } from '@/src/components/SpringCollapse'
import { EXTRAS } from '@/src/components/tour/content'

/** Chapter 7: the rest of the app, one accordion row each. */
export function ExtrasList({ onComplete }: { onComplete: () => void }) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState<Record<number, boolean>>({})

  function toggle(index: number) {
    const next = { ...open }
    if (next[index]) delete next[index]
    else next[index] = true
    setOpen(next)
    if (Object.keys(next).length >= 2) onComplete()
  }

  return (
    <div className="tour-extras">
      {EXTRAS.map((extra, index) => {
        const isOpen = !!open[index]
        return (
          // `layout` springs the siblings below as the row grows, like Mobile's LinearTransition.
          <motion.div
            key={extra.name}
            layout={reduce ? false : 'position'}
            transition={ENVELOPE_SPRING}
            className={`tour-extra-row ${isOpen ? 'is-open' : ''}`}
          >
            <button type="button" className="tour-extra-head" aria-expanded={isOpen} onClick={() => toggle(index)}>
              <div className="tour-row-tile"><extra.icon size={18} aria-hidden /></div>
              <span className="tour-extra-name">{extra.name}</span>
              <motion.span
                className={`tour-extra-plus ${isOpen ? 'is-open' : ''}`}
                initial={false}
                animate={{ rotate: isOpen ? 45 : 0 }}
                transition={reduce ? { duration: 0 } : ENVELOPE_SPRING}
              >
                +
              </motion.span>
            </button>
            <SpringCollapse open={isOpen}>
              <p className="tour-extra-desc">{extra.desc}</p>
            </SpringCollapse>
          </motion.div>
        )
      })}
    </div>
  )
}
