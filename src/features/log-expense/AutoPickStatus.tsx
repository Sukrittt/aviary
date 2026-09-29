'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useAnimate, useReducedMotion, type Transition } from 'motion/react'

// Sits next to the "Category" label in the log-expense modal. While the AI
// fallback looks for a category, a small pill rolls through the user's own
// category emojis next to "Picking…", then slows down and springs onto the
// pick and reads "Picked for you". It stays while the category is one we
// picked, and leaves once the user picks by hand. Dictionary hits skip the
// roll and only play the landing. Mobile's AutoCategoryPill is the same
// motion inside the description field's pill.

export const PICKING_LABEL = 'Picking…'
export const PICKED_LABEL = 'Picked for you'
const ROLL_STEP_MS = 150
const SETTLE_STEPS_MS = [190, 250, 330] as const
const FALLBACK_EMOJIS = ['🍔', '🚕', '🛒', '🎬', '🏠', '💊']
// Underdamped so the final emoji overshoots a touch and clunks into place.
const LAND: Transition = { type: 'spring', stiffness: 380, damping: 14, mass: 0.6 }

type Phase = 'idle' | 'rolling' | 'settling'

interface Props {
  /** The AI lookup is in flight (already gated by thinkingGate's timing). */
  thinking: boolean
  /** The auto-picked category, or null when there's none or the user chose it. */
  picked: { emoji: string; name: string } | null
  rollEmojis: string[]
}

export function AutoPickStatus({ thinking, picked, rollEmojis }: Props) {
  const reduceMotion = useReducedMotion() ?? false
  const pickedKey = picked ? `${picked.emoji}|${picked.name}` : ''
  const [phase, setPhase] = useState<Phase>(thinking ? 'rolling' : 'idle')
  const [prevThinking, setPrevThinking] = useState(thinking)
  const [prevPickedKey, setPrevPickedKey] = useState(pickedKey)
  const [rollIndex, setRollIndex] = useState(0)
  const [stepMs, setStepMs] = useState(ROLL_STEP_MS)
  const [popTick, setPopTick] = useState(0)

  // React to prop changes during render (React's "adjusting state when a prop
  // changes" pattern) so the first frame after thinking ends already knows
  // whether to settle the roll or show the answer.
  if (thinking !== prevThinking || pickedKey !== prevPickedKey) {
    const landed = pickedKey !== prevPickedKey && !!picked
    let next = phase
    if (thinking !== prevThinking) {
      if (thinking) {
        next = 'rolling'
        setStepMs(ROLL_STEP_MS)
      } else {
        next = phase === 'rolling' && landed && !reduceMotion ? 'settling' : 'idle'
      }
    }
    setPrevThinking(thinking)
    setPrevPickedKey(pickedKey)
    if (next !== phase) setPhase(next)
    if (landed && next === 'idle') setPopTick((t) => t + 1)
  }

  useEffect(() => {
    if (phase !== 'rolling' || reduceMotion) return
    const id = setInterval(() => setRollIndex((i) => i + 1), ROLL_STEP_MS)
    return () => clearInterval(id)
  }, [phase, reduceMotion])

  // Decelerate through a few more emojis, then land on the answer.
  useEffect(() => {
    if (phase !== 'settling') return
    const timers: ReturnType<typeof setTimeout>[] = []
    let at = 0
    for (const ms of SETTLE_STEPS_MS) {
      timers.push(setTimeout(() => { setStepMs(ms); setRollIndex((i) => i + 1) }, at))
      at += ms
    }
    timers.push(setTimeout(() => { setPhase('idle'); setPopTick((t) => t + 1) }, at))
    return () => timers.forEach(clearTimeout)
  }, [phase])

  const [scope, animate] = useAnimate<HTMLSpanElement>()
  useEffect(() => {
    if (popTick === 0 || reduceMotion || !scope.current) return
    animate(scope.current, { scale: [1, 1.08, 0.99, 1] }, { duration: 0.42, ease: 'easeOut' })
  }, [popTick, reduceMotion, animate, scope])

  const busy = phase !== 'idle'
  const pool = rollEmojis.length > 0 ? rollEmojis : FALLBACK_EMOJIS
  const emoji = busy ? (reduceMotion ? '✨' : pool[rollIndex % pool.length]) : picked?.emoji ?? ''
  // Every roll step is a fresh span, even when the pool repeats an emoji.
  const emojiKey = busy ? `roll-${rollIndex}` : `pick-${pickedKey}`
  const label = busy ? PICKING_LABEL : PICKED_LABEL
  const visible = busy || !!picked
  const step: Transition = reduceMotion
    ? { duration: 0 }
    : busy
      ? { duration: stepMs / 1000, ease: [0.2, 0.7, 0.3, 1] }
      : LAND

  return (
    <span className="auto-pick" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {visible && (
          <motion.span
            key="pill"
            className="auto-pick-pop"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, transition: { duration: 0.16 } }}
            transition={reduceMotion ? { duration: 0 } : LAND}
          >
            <motion.span ref={scope} className="auto-pick-pill" layout={!reduceMotion}>
              <span className="auto-pick-slot" aria-hidden="true">
                <AnimatePresence initial={!reduceMotion}>
                  <motion.span
                    key={emojiKey}
                    initial={{ y: '100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: '-100%', opacity: 0, transition: { duration: reduceMotion ? 0 : Math.min(stepMs, 220) / 1000 } }}
                    transition={step}
                  >
                    {emoji}
                  </motion.span>
                </AnimatePresence>
              </span>
              <motion.span
                key={label}
                className="auto-pick-label"
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                {label}
              </motion.span>
            </motion.span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
