'use client'

import { useCurrency } from '@/src/context/CurrencyContext'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, type LucideIcon } from 'lucide-react'
import { darkTokens } from '@/src/theme/tokens'


/**
 * Web twins of Mobile's UI primitives (Mobile/src/components/ui/*, shared/*),
 * for the landing-page playground and the app's money screens (MoneyScreens.tsx).
 * Sizes, colours, timings and easings are copied from the RN source; RN
 * Animated/Reanimated become WAAPI and motion. `T` is the dark scheme, since the
 * landing page is dark; app callers pass `var(--tk-*)` colours instead.
 */

export const T = darkTokens

// Mobile/src/theme/scale.ts
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const
export const radius = { sm: 8, md: 14, lg: 20, xl: 28, full: 999 } as const
export const type = { micro: 11, caption: 13, body: 15, bodyLg: 17, title: 22, heading: 28, display: 40, hero: 56 } as const
export const NAV_HEIGHT = 86
export const MOTION_SLOW = 380

/** Reanimated `withSpring` configs; motion runs the same spring physics. */
export const spring = { type: 'spring', damping: 15, stiffness: 180, mass: 1 } as const
export const springTight = { type: 'spring', damping: 18, stiffness: 260, mass: 1 } as const
/** Mobile's `LinearTransition.springify().damping(90).stiffness(900)`: rows sliding into a gap. */
export const LIST_SPRING = { type: 'spring', damping: 90, stiffness: 900, mass: 1 } as const

/** RN `Easing` presets as cubic-bezier tuples. */
export const ease = {
  outCubic: [0.33, 1, 0.68, 1],
  inOutCubic: [0.65, 0, 0.35, 1],
  inOutQuad: [0.45, 0, 0.55, 1],
  outEase: [0, 0, 0.58, 1],
  ease: [0.42, 0, 1, 1],
} as const
export const cssEase = (b: readonly number[]) => `cubic-bezier(${b.join(',')})`

export const elevation = {
  card: '0 4px 12px rgba(0,0,0,0.06)',
  floating: '0 8px 22px rgba(0,0,0,0.15)',
}

const display = 'var(--font-fredoka), sans-serif'
const body = 'var(--font-nunito), sans-serif'

// Mobile/src/theme/fonts.ts
export const font = {
  displayMedium: { fontFamily: display, fontWeight: 500 },
  displaySemiBold: { fontFamily: display, fontWeight: 600 },
  displayBold: { fontFamily: display, fontWeight: 700 },
  bodyMedium: { fontFamily: body, fontWeight: 500 },
  bodySemiBold: { fontFamily: body, fontWeight: 600 },
  bodyBold: { fontFamily: body, fontWeight: 700 },
  bodyExtraBold: { fontFamily: body, fontWeight: 800 },
  bodyBlack: { fontFamily: body, fontWeight: 900 },
} satisfies Record<string, CSSProperties>

/** The simulated device. `top`/`bottom` stand in for safe-area insets. */
export const PHONE = { width: 360, height: 740, top: 44, bottom: 12 } as const

/** The phone's screen element: sheets portal into it, the way RN's Modal covers the app. */
export const PhoneScreenContext = createContext<HTMLElement | null>(null)

export const row: CSSProperties = { display: 'flex', flexDirection: 'row', alignItems: 'center' }
export const col: CSSProperties = { display: 'flex', flexDirection: 'column' }

/** useInvalidFeedback: one short horizontal shake (45/90/45ms, ±8px). */
export function useShake<E extends HTMLElement>() {
  const ref = useRef<E>(null)
  const shake = useCallback(() => {
    ref.current?.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(8px)', offset: 0.25 },
        { transform: 'translateX(-8px)', offset: 0.75 },
        { transform: 'translateX(0)' },
      ],
      { duration: 180, easing: 'linear' },
    )
  }, [])
  return [ref, shake] as const
}

/**
 * Mobile's Nudge, as a hook: each time `trigger` changes while `active`, the
 * element wiggles sideways (-7, 7, -4, 0 over 295ms) and pops to 1.05 before
 * springing back. Points at a field the user skipped; the caller draws the
 * highlight. Uses the independent `translate`/`scale` properties, so it never
 * fights a CSS `transform`.
 */
export function useNudge<E extends HTMLElement>(trigger: number, active: boolean) {
  const ref = useRef<E>(null)
  useEffect(() => {
    const el = ref.current
    if (trigger === 0 || !active || !el || typeof el.animate !== 'function') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    el.animate(
      [
        { translate: '0' },
        { translate: '-7px', offset: 55 / 295 },
        { translate: '7px', offset: 145 / 295 },
        { translate: '-4px', offset: 225 / 295 },
        { translate: '0' },
      ],
      { duration: 295 },
    )
    el.animate([{ scale: '1' }, { scale: '1.05' }], { duration: 110 }).finished.then(
      () => el.animate([{ scale: '1.05' }, { scale: '1' }], { duration: 765, easing: NUDGE_SPRING_EASE }),
      () => {},
    )
    // Only a new trigger replays it, same as Mobile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])
  return ref
}

/** withSpring(1, { damping: 12, stiffness: 220 }), sampled as CSS linear(). */
const NUDGE_SPRING_EASE =
  'linear(0, 0.1, 0.33, 0.61, 0.87, 1.07, 1.2, 1.25, 1.24, 1.18, 1.12, 1.05, 0.99, 0.96, 0.94, 0.94, 0.95, 0.97, 0.98, 1, 1.01, 1.01, 1.02, 1.01, 1)'

// ─── AmountText ──────────────────────────────────────────────────────────────

const lastSeen = new Map<string, { text: string; value: number }>()

export function AmountText({
  value,
  size,
  color = T.text,
  weight = 'displaySemiBold',
  animate = false,
  rawText,
  id,
  style,
}: {
  value: number
  /** Omit to inherit font, size and colour from the surrounding CSS. */
  size?: number
  color?: string
  weight?: keyof typeof font
  animate?: boolean
  rawText?: string
  id?: string
  style?: CSSProperties
}) {
  const { formatCurrency } = useCurrency()

  const text = rawText ?? formatCurrency(value)
  const textStyle: CSSProperties = {
    ...(size === undefined ? null : { fontSize: size, color, ...font[weight], letterSpacing: -0.5 }),
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'pre',
    ...style,
  }
  if (!animate) return <span style={textStyle}>{text}</span>
  return <Odometer text={text} value={value} textStyle={textStyle} id={id} />
}

function Odometer({
  text,
  value,
  textStyle,
  id,
}: {
  text: string
  value: number
  textStyle: CSSProperties
  id?: string
}) {
  // usePrevious as state (adjusted during render, React's documented pattern):
  // `prev` is the pair before the latest change, so each slot can diff old vs new.
  const [pair, setPair] = useState(() => {
    const now = { text, value }
    return { prev: (id && lastSeen.get(id)) || now, curr: now }
  })
  if (pair.curr.text !== text || pair.curr.value !== value) {
    setPair({ prev: pair.curr, curr: { text, value } })
  }
  const shown = pair.prev
  const direction: 'up' | 'down' = value < shown.value ? 'down' : 'up'
  useEffect(() => {
    if (id) lastSeen.set(id, { text, value })
  }, [text, value, id])

  // em, not px, so the roll also works when the font size comes from CSS.
  const rowHeight = 1.2
  const chars = text.split('')
  const prevChars = shown.text.split('')
  const lengthChanged = chars.length !== prevChars.length

  return (
    <span aria-label={text} style={{ ...textStyle, display: 'inline-flex', alignItems: 'flex-end' }}>
      {chars.map((ch, i) => {
        const prevIndex = prevChars.length - (chars.length - i)
        return (
          <Digit
            key={i}
            oldChar={prevIndex >= 0 ? prevChars[prevIndex] : ''}
            newChar={ch}
            rowHeight={rowHeight}
            direction={direction}
            lengthChanged={lengthChanged}
          />
        )
      })}
    </span>
  )
}

const isDigit = (c: string) => c >= '0' && c <= '9'

function Digit({
  oldChar,
  newChar,
  rowHeight,
  direction,
  lengthChanged,
}: {
  oldChar: string
  newChar: string
  rowHeight: number
  direction: 'up' | 'down'
  lengthChanged: boolean
}) {
  const changed = oldChar !== '' && isDigit(oldChar) && isDigit(newChar) && (oldChar !== newChar || lengthChanged)
  const stack = useRef<HTMLSpanElement>(null)
  const from = direction === 'down' ? -rowHeight : 0
  const to = direction === 'down' ? 0 : -rowHeight
  const h = `${rowHeight}em`

  useLayoutEffect(() => {
    if (!changed || typeof stack.current?.animate !== 'function') return
    stack.current.animate([{ transform: `translateY(${from}em)` }, { transform: `translateY(${to}em)` }], {
      duration: MOTION_SLOW,
      easing: cssEase(ease.outCubic),
      fill: 'forwards',
    })
    // Same deps as Mobile's Digit: both chars, so a repeated newChar still rolls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldChar, newChar, direction])

  const charStyle: CSSProperties = { display: 'block', height: h, lineHeight: h }
  // Keyed so a finished roll's fill-forwards transform can never be inherited
  // by a static glyph (or a later roll) that React would otherwise reuse the node for.
  if (!changed) {
    return (
      <span style={{ height: h, display: 'block' }}>
        <span key="static" style={charStyle}>
          {newChar}
        </span>
      </span>
    )
  }
  return (
    // Clip only above and below, where the other digit scrolls past. Clipping
    // the sides too shaved bold glyphs that overhang their slot under
    // negative letter-spacing (Home's Ready to Assign).
    <span style={{ height: h, clipPath: 'inset(0 -0.25em)', display: 'block' }}>
      <span
        key={`${oldChar}${newChar}${direction}`}
        ref={stack}
        style={{ display: 'block', transform: `translateY(${to}em)` }}
      >
        <span style={charStyle}>{direction === 'down' ? newChar : oldChar}</span>
        <span style={charStyle}>{direction === 'down' ? oldChar : newChar}</span>
      </span>
    </span>
  )
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

const resetButton: CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
}
export const pressable = resetButton

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  style?: CSSProperties
}) {
  const bg = variant === 'primary' ? T.accent : variant === 'secondary' ? T.pillBg : 'transparent'
  const fg = variant === 'primary' ? T.onAccent : T.text
  const border = variant === 'secondary' ? T.border : 'transparent'
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onPress}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={spring}
      style={{
        ...resetButton,
        ...row,
        justifyContent: 'center',
        gap: space.sm,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: radius.full,
        padding: `${space.md + 2}px ${space.xl}px`,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'default' : 'pointer',
        color: fg,
        ...font.bodyBold,
        fontSize: type.bodyLg,
        ...style,
      }}
    >
      {label}
    </motion.button>
  )
}

export function IconButton({
  icon: Icon,
  onPress,
  size = 40,
  color = T.text,
  background = T.cardSolid,
  label,
}: {
  icon: LucideIcon
  onPress: () => void
  size?: number
  color?: string
  background?: string
  label: string
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onPress}
      whileTap={{ scale: 0.9 }}
      transition={spring}
      style={{
        ...resetButton,
        ...row,
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: size / 2,
        background,
        flexShrink: 0,
      }}
    >
      <Icon size={Math.round(size * 0.45)} color={color} strokeWidth={2} />
    </motion.button>
  )
}

export function Chip({
  icon,
  label,
  selected,
  onPress,
}: {
  icon?: string
  label: string
  selected?: boolean
  onPress: () => void
}) {
  const bg = selected ? T.accentInk : T.pillBg
  const fg = selected ? T.onAccent : T.text2
  const border = selected ? T.accentInk : T.border
  return (
    <motion.button
      type="button"
      aria-pressed={!!selected}
      onClick={onPress}
      whileTap={{ scale: 0.94 }}
      transition={spring}
      style={{
        ...resetButton,
        ...row,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: radius.full,
        padding: `${space.sm}px ${space.lg}px`,
        color: fg,
      }}
    >
      {icon ? <span style={{ fontSize: type.caption, marginRight: space.xs }}>{icon}</span> : null}
      <span style={{ ...font.bodySemiBold, fontSize: type.caption }}>{label}</span>
    </motion.button>
  )
}

// ─── Numpad ──────────────────────────────────────────────────────────────────

const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

/** Numpad: long-press delete clears. `onAccent` (the landing's log screen) is transparent keys with white labels; otherwise themed card keys. */
export function Numpad({
  onDigit,
  onBackspace,
  onClear,
  extraKey,
  onAccent = true,
  disabled = false,
}: {
  onDigit: (digit: string) => void
  onBackspace: () => void
  onClear: () => void
  extraKey?: string
  onAccent?: boolean
  disabled?: boolean
}) {
  const keyColor = onAccent ? '#ffffff' : 'var(--tk-text)'
  const timer = useRef(0)
  const longFired = useRef(false)
  const keys = PAD_KEYS.map((k, i) => (i === 9 ? (extraKey ?? '') : k))

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.md - 2 }}>
      {keys.map((k, i) => {
        const keyStyle: CSSProperties = {
          width: '31.3%',
          minHeight: 56,
          border: `1px solid ${onAccent ? 'transparent' : 'var(--tk-border)'}`,
          background: onAccent ? 'transparent' : 'var(--tk-card)',
          borderRadius: radius.lg,
          ...row,
          justifyContent: 'center',
        }
        if (k === '') return <div key={i} style={keyStyle} />
        const isDel = k === 'del'
        return (
          <button
            key={i}
            type="button"
            className="m-key"
            aria-label={isDel ? 'Delete' : k}
            disabled={disabled}
            style={{ ...resetButton, ...keyStyle, opacity: disabled ? 0.5 : 1 }}
            onPointerDown={() => {
              longFired.current = false
              if (!isDel) return
              timer.current = window.setTimeout(() => {
                longFired.current = true
                onClear()
              }, 500)
            }}
            onPointerUp={() => clearTimeout(timer.current)}
            onPointerLeave={() => clearTimeout(timer.current)}
            onClick={() => {
              if (longFired.current) return
              if (isDel) onBackspace()
              else onDigit(k)
            }}
          >
            {isDel ? (
              <ChevronLeft size={22} color={keyColor} />
            ) : (
              <span style={{ color: keyColor, ...font.displaySemiBold, fontSize: 22 }}>{k}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** useAmountEntry: numpad editing with a 2-decimal cap and 9-char limit. `onChange` lets a screen reset state derived from the amount. */
export function useAmountEntry(initial = '', { onChange, shakeAtZero = true }: { onChange?: () => void; shakeAtZero?: boolean } = {}) {
  const [amount, setAmount] = useState(initial)
  const [shakeRef, shake] = useShake<HTMLDivElement>()
  const pushDigit = useCallback((digit: string) => {
    setAmount((prev) => {
      if (digit === '.') return prev.includes('.') ? prev : prev === '' ? '0.' : prev + '.'
      const dot = prev.indexOf('.')
      if (dot !== -1 && prev.length - dot - 1 >= 2) return prev
      const next = (prev + digit).replace(/^0+(?=\d)/, '')
      return next.length > 9 ? prev : next
    })
    onChange?.()
  }, [onChange])
  const handleBackspace = useCallback(() => {
    if (shakeAtZero ? Number(amount) === 0 : amount === '') {
      shake()
      return
    }
    setAmount((prev) => prev.slice(0, -1))
    onChange?.()
  }, [amount, shake, onChange, shakeAtZero])
  return { amount, setAmount, pushDigit, handleBackspace, shakeRef }
}

// ─── Animated bits ───────────────────────────────────────────────────────────

const CHECK_PATH_LENGTH = 19.8

/** CheckIcon: fades in while the checkmark draws itself on. */
export function CheckIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: 'block' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: ease.ease }}
    >
      <motion.path
        d="M5 13l4 4L19 7"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${CHECK_PATH_LENGTH} ${CHECK_PATH_LENGTH}`}
        initial={{ strokeDashoffset: CHECK_PATH_LENGTH }}
        animate={{ strokeDashoffset: 0 }}
        transition={{ duration: 0.35, delay: 0.15, ease: ease.outEase }}
      />
    </motion.svg>
  )
}

const POP_SPRING = { type: 'spring', mass: 0.7, damping: 12, stiffness: 160 } as const

/** Mobile's list reveal: first item at 100ms, then 45ms apart, capped at the 7th. */
export const STAGGER = { mount: 100, block: 90, item: 45, cap: 6 } as const
export const staggerDelay = (index: number, base: number = STAGGER.mount) =>
  base + Math.min(index, STAGGER.cap) * STAGGER.item

/** PopIn as props, for spreading onto any motion element (`<motion.li {...popIn(ms)}>`). */
export const popIn = (delay: number) =>
  ({
    initial: { opacity: 0, scale: 0.92, y: 6 },
    animate: { opacity: 1, scale: 1, y: 0 },
    transition: { ...POP_SPRING, delay: delay / 1000 },
  }) as const

/** PopIn: mount-only fade + scale + rise on a bouncy spring. */
export function PopIn({
  play,
  delay,
  style,
  children,
}: {
  play: boolean
  delay: number
  style?: CSSProperties
  children: ReactNode
}) {
  const [initial] = useState(() => (play ? { opacity: 0, scale: 0.92, y: 6 } : false))
  return (
    <motion.div
      style={style}
      initial={initial}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ ...POP_SPRING, delay: delay / 1000 }}
    >
      {children}
    </motion.div>
  )
}

const SHEET_SPRING = { type: 'spring', damping: 64, stiffness: 700, mass: 1 } as const

/**
 * BottomSheet: backdrop + slide-up card, portalled into the phone's screen.
 * RN's `animationType="slide"` moves the whole modal (backdrop included), and
 * the card eases between heights when its content resizes.
 */
export function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const host = useContext(PhoneScreenContext)
  if (!host) return null
  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          key="sheet"
          onClick={onClose}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.32, ease: ease.outCubic }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 60,
            background: 'rgba(0,0,0,0.5)',
            ...col,
            justifyContent: 'flex-end',
          }}
        >
          <SheetCard onClick={(e) => e.stopPropagation()}>{children}</SheetCard>
        </motion.div>
      )}
    </AnimatePresence>,
    host,
  )
}

/**
 * Reanimated's `LinearTransition` on a container: the box springs to its
 * content's new height. Real height rather than motion's `layout` (a scale
 * transform), which would squash the text inside mid-animation.
 */
export function AutoHeight({
  transition,
  style,
  innerStyle,
  className,
  onClick,
  children,
}: {
  transition: object
  style?: CSSProperties
  innerStyle?: CSSProperties
  className?: string
  onClick?: (e: React.MouseEvent) => void
  children: ReactNode
}) {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <motion.div
      className={className}
      onClick={onClick}
      initial={false}
      animate={height == null ? undefined : { height }}
      transition={transition}
      style={style}
    >
      <div ref={inner} style={innerStyle}>
        {children}
      </div>
    </motion.div>
  )
}

function SheetCard({ children, onClick }: { children: ReactNode; onClick: (e: React.MouseEvent) => void }) {
  return (
    <AutoHeight
      className="m-noscroll"
      onClick={onClick}
      transition={SHEET_SPRING}
      innerStyle={{ padding: 16, paddingBottom: PHONE.bottom + 16 }}
      style={{
        background: T.modalStrong,
        border: `1px solid ${T.borderStrong}`,
        borderBottom: 0,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '85%',
        overflowY: 'auto',
        color: T.text,
      }}
    >
      {children}
    </AutoHeight>
  )
}
