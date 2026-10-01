'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, type AnimationPlaybackControls } from 'motion/react'
import { font, pressable, radius, space, T, type } from './kit'

/**
 * Web twin of Mobile's src/features/log-expense/AutoCategoryPill.tsx. While a
 * category is being looked up, the emoji slot spins like a slot-machine reel
 * through the category emojis, then eases out onto the pick with an overshoot,
 * the pill's width glides from the left, and a fan of lines flicks out of its
 * top edge. Constants are copied from the RN source.
 */

export const PICKING_LABEL = 'Picking…'
export const SETTLE_MS = 1000
const SPIN_STEP_MS = 85
const SETTLE_BACK = 1.2
const SETTLE_NOTCHES = SETTLE_MS / ((SETTLE_BACK + 3) * SPIN_STEP_MS)
const FALLBACK_EMOJIS = ['🍔', '🚕', '🛒', '🎬', '🏠', '💊']
const MIN_REEL = 8
const EMOJI_BOX = 17
export const PILL_MAX_WIDTH = 140
const PAD_X = 12
const WIDTH_SPRING = { type: 'spring', mass: 1, damping: 20, stiffness: 110 } as const
const LAND_SPRING = { type: 'spring', mass: 0.6, damping: 9, stiffness: 220 } as const
const POP_SPRING = { type: 'spring', mass: 0.7, damping: 12, stiffness: 160 } as const
const BURST_ANGLES = [-66, -44, -22, 0, 22, 44, 66]

const backOut = (s: number) => (t: number) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2

type Phase = 'idle' | 'rolling' | 'settling'

export function AutoCategoryPill({ selected, thinking, rollEmojis, onPress }: {
  selected: { emoji: string; name: string } | null
  thinking: boolean
  rollEmojis: string[]
  onPress: () => void
}) {
  const reduce = useReducedMotion()
  const selKey = selected ? `${selected.emoji}|${selected.name}` : ''
  const [phase, setPhase] = useState<Phase>(thinking ? 'rolling' : 'idle')
  const [prevThinking, setPrevThinking] = useState(thinking)
  const [prevSelKey, setPrevSelKey] = useState(selKey)
  const [popTick, setPopTick] = useState(0)

  // Same "adjust state when a prop changes" pattern as Mobile, so the first
  // frame after the lookup ends already knows whether to settle the reel.
  if (thinking !== prevThinking || selKey !== prevSelKey) {
    const changed = selKey !== prevSelKey && !!selected
    let next = phase
    if (thinking !== prevThinking) next = thinking ? 'rolling' : phase === 'rolling' && !!selected && !reduce ? 'settling' : 'idle'
    setPrevThinking(thinking)
    setPrevSelKey(selKey)
    if (next !== phase) setPhase(next)
    if (changed && next === 'idle') setPopTick((t) => t + 1)
  }

  useEffect(() => {
    if (phase !== 'settling') return
    const id = setTimeout(() => {
      setPhase('idle')
      setPopTick((t) => t + 1)
    }, SETTLE_MS)
    return () => clearTimeout(id)
  }, [phase])

  const scale = useMotionValue(1)
  useEffect(() => {
    if (popTick === 0 || reduce) return
    const a = animate(scale, 1.09, { duration: 0.14 })
    a.then(() => animate(scale, 1, POP_SPRING))
    return () => a.stop()
  }, [popTick, reduce, scale])

  const busy = phase !== 'idle'
  const hasEmoji = busy || !!selected
  const label = busy ? PICKING_LABEL : selected?.name ?? 'Category'
  const pool = rollEmojis.length > 0 ? rollEmojis : FALLBACK_EMOJIS

  // Pinned by its right edge: an off-screen copy measures the target width and
  // the real pill springs to it, so the left edge glides.
  const measure = useRef<HTMLSpanElement>(null)
  const width = useMotionValue(0)
  useLayoutEffect(() => {
    const w = Math.ceil(measure.current?.getBoundingClientRect().width ?? 0) + 1 + 2 * PAD_X
    if (width.get() === 0 || reduce) width.set(w)
    else animate(width, w, WIDTH_SPRING)
  }, [label, hasEmoji, reduce, width])

  const content = (labelKey?: string) => <>
    {hasEmoji && <span style={{ width: EMOJI_BOX + 2, height: EMOJI_BOX, flexShrink: 0 }} />}
    <motion.span
      key={labelKey}
      initial={labelKey ? { opacity: 0, y: 4 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.33, 1, 0.68, 1] }}
      style={{ ...font.bodySemiBold, fontSize: 12, whiteSpace: 'nowrap', marginLeft: hasEmoji ? space.xs : 0, maxWidth: PILL_MAX_WIDTH - 2 * PAD_X - (hasEmoji ? EMOJI_BOX + 2 + space.xs : 0), overflow: 'hidden', textOverflow: 'ellipsis' }}
    >
      {label}
    </motion.span>
  </>

  return <motion.div style={{ scale, position: 'relative' }}>
    <span ref={measure} aria-hidden="true" style={{ position: 'absolute', visibility: 'hidden', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>{content()}</span>
    <motion.button
      type="button"
      onClick={onPress}
      aria-label={busy ? 'Picking a category' : selected ? `Category: ${selected.name}` : 'Category'}
      style={{ ...pressable, width, height: 31, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingInline: PAD_X, overflow: 'hidden', background: 'rgba(255, 255, 255, 0.3)', borderRadius: radius.full, color: T.onAccent }}
    >
      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, position: 'relative' }}>
        {hasEmoji && (reduce
          ? <span style={{ position: 'absolute', left: 0, fontSize: type.caption, lineHeight: `${EMOJI_BOX}px` }}>{busy ? '✨' : selected!.emoji}</span>
          : <EmojiReel phase={phase} target={selected?.emoji ?? null} pool={pool} />)}
        {content(label)}
      </span>
    </motion.button>
    {popTick > 0 && !reduce && <span key={popTick} className="m-burst" aria-hidden="true">{BURST_ANGLES.map((d) => <i key={d} style={{ '--deg': `${d}deg` } as CSSProperties} />)}</span>}
  </motion.div>
}

/** One-emoji window onto an endless reel; `pos` is the reel position in emoji units. */
function EmojiReel({ phase, target, pool }: { phase: Phase; target: string | null; pool: string[] }) {
  const strip = useMemo(() => {
    let s = pool
    while (s.length < MIN_REEL) s = s.concat(pool)
    return s
  }, [pool])
  const n = strip.length
  const pos = useMotionValue(0)
  const [p, setP] = useState(0)
  useMotionValueEvent(pos, 'change', setP)
  const [overrides, setOverrides] = useState<Record<number, string>>(() => (target ? { 0: target } : {}) as Record<number, string>)
  const landed = useRef<string | null>(target)
  const anim = useRef<AnimationPlaybackControls | null>(null)

  useEffect(() => {
    const run = (a: AnimationPlaybackControls) => { anim.current?.stop(); anim.current = a }
    if (phase === 'rolling') {
      const from = Math.round(pos.get())
      landed.current = null
      const warm = animate(pos, from + 1, { duration: (SPIN_STEP_MS * 2) / 1000, ease: (t) => t * t })
      run(warm)
      warm.then(() => run(animate(pos, [from + 1, from + 1 + n], { duration: (SPIN_STEP_MS * n) / 1000, ease: 'linear', repeat: Infinity })))
      return
    }
    if (!target || landed.current === target) return
    const at = phase === 'settling' ? Math.ceil(pos.get() + SETTLE_NOTCHES - 0.5) : Math.round(pos.get()) + 1
    setOverrides((o) => ({ ...o, [((at % n) + n) % n]: target }))
    landed.current = target
    run(phase === 'settling'
      ? animate(pos, at, { duration: SETTLE_MS / 1000, ease: backOut(SETTLE_BACK) })
      : animate(pos, at, LAND_SPRING))
    // Only phase and target move the reel; the rest is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, target])
  useEffect(() => () => anim.current?.stop(), [])

  return <span style={{ position: 'absolute', left: 0, width: EMOJI_BOX + 2, height: EMOJI_BOX, overflow: 'hidden' }}>
    {strip.map((emoji, i) => {
      const wrapped = (((i - p) % n) + n) % n
      const y = wrapped > n / 2 ? wrapped - n : wrapped
      const away = Math.min(1, Math.abs(y))
      return <span key={i} style={{
        position: 'absolute', inset: 0, textAlign: 'center', fontSize: type.caption, lineHeight: `${EMOJI_BOX}px`,
        opacity: 1 - away * 0.8,
        transform: `perspective(120px) translateY(${y * EMOJI_BOX}px) rotateX(${-y * 50}deg) scale(${1 - away * 0.2})`,
      }}>{overrides[i] ?? emoji}</span>
    })}
  </span>
}
