import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  LOADING_PHRASES,
  ORDERED_LOADING_FEATURES,
  type LoadingFeature,
} from '../lib/loadingPhrases'

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

interface Props {
  className?: string
  style?: React.CSSProperties
  phrases?: readonly string[]
  feature?: LoadingFeature
  ordered?: boolean
  placement?: 'page' | 'section' | 'inline'
  align?: 'left' | 'center' | 'right'
}

export function LoadingCaption({
  className = '',
  style,
  phrases,
  feature = 'general',
  ordered,
  placement = 'section',
  align = placement === 'inline' ? 'left' : 'center',
}: Props) {
  const [phraseIndex, setPhraseIndex] = useState(0)
  const reduceMotion = useReducedMotion()
  const source = phrases ?? LOADING_PHRASES[feature]
  const preserveOrder = ordered ?? (phrases ? false : ORDERED_LOADING_FEATURES.has(feature))
  const sourceKey = source.join('\u0000')
  const stableSource = useMemo(() => [...source], [source])
  // Keep the server and first client render deterministic, then mirror Mobile's
  // one-time shuffle after hydration for the feature sets that shuffle.
  const [displayPhrases, setDisplayPhrases] = useState(stableSource)

  useEffect(() => {
    setPhraseIndex(0)
    setDisplayPhrases(preserveOrder ? stableSource : shuffleArray(stableSource))
  }, [preserveOrder, stableSource])

  useEffect(() => {
    if (reduceMotion || displayPhrases.length < 2) return
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % displayPhrases.length)
    }, 1800)
    return () => clearInterval(interval)
  }, [displayPhrases.length, reduceMotion])

  const phrase = displayPhrases[phraseIndex] ?? ''

  return (
    <div
      className={`loading-caption loading-caption--${placement} loading-caption--${align} ${className}`}
      style={style}
      aria-busy="true"
    >
      <span className="loading-caption-status" role="status">Loading</span>
      <AnimatePresence initial={false} mode="sync">
        {phrase && (
          <motion.span
            key={`${sourceKey}-${phraseIndex}-${phrase}`}
            className="loading-caption-text"
            aria-hidden="true"
            initial={reduceMotion ? false : { y: '100%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={reduceMotion ? undefined : { y: '-100%', opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
          >
            <span className="text-shimmer">{phrase}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}
