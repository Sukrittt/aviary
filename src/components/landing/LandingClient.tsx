'use client'

import { useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import { Volume2 } from 'lucide-react'
import { useSample } from './sample'


export function LandingMotion({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion()
  return <MotionConfig reducedMotion="user" transition={reduced ? { duration: 0 } : undefined}>{children}</MotionConfig>
}

/** One open at a time; the answer springs its height open and closed instead of the browser's instant details toggle. */
export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  const [open, setOpen] = useState(-1)
  return <div className="lp-faq">{items.map((item, i) => <div className="lp-faq-item" key={item.q}>
    <button type="button" className="lp-faq-q" aria-expanded={open === i} onClick={() => setOpen((o) => (o === i ? -1 : i))}>
      {item.q}<span className={`lp-faq-icon${open === i ? ' is-open' : ''}`} aria-hidden="true">+</span>
    </button>
    <AnimatePresence initial={false}>
      {open === i && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ height: { type: 'spring', bounce: 0, duration: 0.35 }, opacity: { duration: 0.2 } }} style={{ overflow: 'hidden' }}>
        <div className="lp-faq-answer">{item.a}</div>
      </motion.div>}
    </AnimatePresence>
  </div>)}</div>
}

/** The app's log chime, plus its buzz where the browser can (Chrome on Android, after a tap). */
export function chime() {
  new Audio('/landing/success.m4a').play().catch(() => {})
  navigator.vibrate?.([14, 50, 22])
}

/** The Added recording, with a button that replays it from the top with the chime and the buzz. */
export function AddedClip() {
  const { media, added } = useSample()
  const ref = useRef<HTMLVideoElement>(null)
  const replay = () => {
    const v = ref.current
    if (v) {
      v.currentTime = 0
      v.play()?.catch(() => {})
    }
    chime()
  }
  return <div className="lp-win-added">
    <video ref={ref} className="lp-win-shot" src={media('clip-added.mp4')} poster={media('poster-added.jpg')} autoPlay muted loop playsInline preload="metadata" aria-label={added} />
    <button type="button" className="lp-hear" onClick={replay}><Volume2 size={16} aria-hidden="true" />Hear the chime</button>
  </div>
}
