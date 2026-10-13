'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { FolderOpenIcon, HouseIcon, PlusIcon, ReceiptIcon, UserIcon, type PhosphorIcon, type IconWeight } from '@/src/components/icons'
import { CheckIcon, PHONE, T, elevation, font, pressable, radius, row, spring, springTight, useShake } from './kit'

/** Twin of Mobile/src/components/nav/{FloatingNav,NavIcons,AddCircleAnim}.tsx. */

export type NavRoute = 'index' | 'activity' | 'envelopes' | 'more'
type Glyph = (props: { size: number; color: string; weight?: IconWeight }) => ReactNode

const fade = (color: string, prop: 'fill' | 'stroke'): CSSProperties => ({ [prop]: color, transition: `${prop} 200ms` })

// Regular when idle, fill on the selected tab, matching Mobile's NavIcons.
const glyph = (Icon: PhosphorIcon): Glyph =>
  function NavGlyph({ size, color, weight = 'regular' }) {
    return <Icon size={size} weight={weight} style={fade(color, 'fill')} />
  }

const HomeGlyph = glyph(HouseIcon)
const ActivityGlyph = glyph(ReceiptIcon)
const EnvelopeGlyph = glyph(FolderOpenIcon)
const ProfileGlyph = glyph(UserIcon)
const PlusGlyph: Glyph = ({ size, color }) => <PlusIcon size={size} weight="bold" style={fade(color, 'fill')} />

const NAV_ROUTES: { name: NavRoute; glyph: Glyph; label: string }[] = [
  { name: 'index', glyph: HomeGlyph, label: 'Home' },
  { name: 'activity', glyph: ActivityGlyph, label: 'Activity' },
  { name: 'envelopes', glyph: EnvelopeGlyph, label: 'Categories' },
  { name: 'more', glyph: ProfileGlyph, label: 'More' },
]

type NavSlot = { kind: 'route'; name: NavRoute; glyph: Glyph; label: string } | { kind: 'add' }
const NAV_SLOTS: NavSlot[] = [
  ...NAV_ROUTES.slice(0, 2).map((r) => ({ kind: 'route' as const, ...r })),
  { kind: 'add' as const },
  ...NAV_ROUTES.slice(2).map((r) => ({ kind: 'route' as const, ...r })),
]
const ADD_INDEX = 2

const CIRCLE = 56
const INACTIVE_SCALE = 0.82
const ICON = 26
const RING_WIDTH = 3
const RING_SIZE = CIRCLE + 2 * (3 + RING_WIDTH)
const SLOT = 72
const ROW_HEIGHT = RING_SIZE + 10 + 24
const BACKDROP_PAD = 7

const slotOffset = (i: number) => i * SLOT
const indexFromOffset = (x: number) => Math.min(NAV_SLOTS.length - 1, Math.max(0, Math.round(x / SLOT)))
const slotProximity = (x: number, index: number) => Math.min(1, Math.abs(x / SLOT - index))
const indexOfRoute = (name: NavRoute | null) =>
  name == null ? -1 : NAV_SLOTS.findIndex((s) => s.kind === 'route' && s.name === name)

/**
 * Detached carousel nav: the selected slot sits at centre, larger and ringed;
 * dragging hands size and ring to whichever slot is nearest, and release snaps
 * to it. Native CSS scroll-snap does the snapping; a mouse drag is bolted on
 * since desktop pointers can't swipe a scroller.
 *
 * `onSelect` returns false for a destination the playground doesn't have, and
 * the row glides back to the live slot.
 */
export function FloatingNav({
  active,
  onSelect,
  onAdd,
  addActive = false,
  addSaving = false,
  addSuccess = false,
  addInvalid = false,
  addDisabled = false,
  addHint = false,
}: {
  active: NavRoute | null
  onSelect: (name: NavRoute) => boolean
  onAdd: () => void
  addActive?: boolean
  addSaving?: boolean
  addSuccess?: boolean
  addInvalid?: boolean
  addDisabled?: boolean
  /** Meaningful only when addActive: a first-timer's form is ready, so pulse the add slot and say it saves. */
  addHint?: boolean
}) {
  const [shakeRef, shake] = useShake<HTMLDivElement>()
  const idle = addActive ? '#ffffff' : T.cardSolid
  const idleIcon = addActive ? '#000000' : T.text2
  const activeIndex = addActive ? ADD_INDEX : indexOfRoute(active)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [initialIndex] = useState(() => (activeIndex === -1 ? 0 : activeIndex))
  const [scrollX, setScrollX] = useState(slotOffset(initialIndex))
  const restingIndex = useRef(initialIndex)
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)

  function handleAdd() {
    if (addActive && addInvalid) shake()
    else onAdd()
  }

  function glideTo(index: number) {
    restingIndex.current = index
    scrollRef.current?.scrollTo({ left: slotOffset(index), behavior: 'smooth' })
  }

  // Latest-callback ref (Next 15's bundled React has no useEffectEvent): the
  // scroll listeners below subscribe once but always settle with current props.
  const settleRef = useRef(() => {})
  useLayoutEffect(() => {
    settleRef.current = () => {
      const el = scrollRef.current
      if (!el) return
      el.style.scrollSnapType = ''
      const idx = indexFromOffset(el.scrollLeft)
      if (idx === restingIndex.current) return
      restingIndex.current = idx
      const slot = NAV_SLOTS[idx]
      if (slot.kind === 'add') handleAdd()
      else if (!onSelect(slot.name)) glideTo(activeIndex)
    }
  })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = slotOffset(initialIndex)
    let timer = 0
    const settle = () => settleRef.current()
    const hasScrollEnd = 'onscrollend' in window
    const onScroll = () => {
      setScrollX(el.scrollLeft)
      if (hasScrollEnd || drag.current) return
      clearTimeout(timer)
      timer = window.setTimeout(settle, 140)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    if (hasScrollEnd) el.addEventListener('scrollend', settle)
    return () => {
      clearTimeout(timer)
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', settle)
    }
  }, [initialIndex])

  // Re-centre when the committed slot changes from outside a drag (a tap).
  useEffect(() => {
    if (activeIndex === -1 || activeIndex === restingIndex.current) return
    glideTo(activeIndex)
  }, [activeIndex])

  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 4 }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 10 - BACKDROP_PAD,
          bottom: 0,
          background: addActive ? T.accent : T.bg,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
        }}
      />
      {addActive && addHint && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 4 + (ROW_HEIGHT + PHONE.bottom + RING_SIZE) / 2 + 6, ...row, justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ color: T.onAccent, ...font.bodySemiBold, fontSize: 13, padding: '5px 12px', borderRadius: 999, background: 'rgba(0, 0, 0, 0.22)' }}>Tap + to save</span>
        </div>
      )}
      <div
        ref={scrollRef}
        className="m-noscroll"
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') return
          drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moved: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const dx = e.clientX - d.x
          if (!d.moved && Math.abs(dx) < 4) return
          if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId)
          d.moved = true
          e.currentTarget.style.scrollSnapType = 'none'
          e.currentTarget.scrollLeft = d.left - dx
        }}
        onPointerUp={(e) => {
          const d = drag.current
          if (!d?.moved) {
            drag.current = null
            return
          }
          e.currentTarget.scrollTo({ left: slotOffset(indexFromOffset(e.currentTarget.scrollLeft)), behavior: 'smooth' })
          // Held until the click that follows this pointerup has been swallowed.
          setTimeout(() => (drag.current = null), 0)
        }}
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.stopPropagation()
            e.preventDefault()
          }
        }}
        style={{
          position: 'relative',
          height: ROW_HEIGHT + PHONE.bottom,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          overscrollBehaviorX: 'contain',
          display: 'flex',
          alignItems: 'center',
          paddingInline: (PHONE.width - SLOT) / 2,
          cursor: 'grab',
        }}
      >
        {NAV_SLOTS.map((slot, i) =>
          slot.kind === 'add' ? (
            <div key="add" ref={shakeRef} style={{ flexShrink: 0, position: 'relative' }}>
              {addActive && addHint && <AddHalo color={T.onAccent} />}
              <NavCircle
                glyph={PlusGlyph}
                label="Log expense"
                selected={addActive}
                background={addActive ? T.accent : idle}
                color={addActive ? T.onAccent : idleIcon}
                onPress={handleAdd}
                disabled={addActive && (addDisabled || addSaving || addSuccess)}
                t={slotProximity(scrollX, i)}
                floating
                overrideContent={
                  addActive && addSuccess ? (
                    <AddCircleDone discColor={T.mint} checkColor={T.onAccent} />
                  ) : addActive && addSaving ? (
                    <AddCircleLoad discColor={T.accent} iconColor={T.onAccent} />
                  ) : undefined
                }
              />
            </div>
          ) : (
            <NavCircle
              key={slot.name}
              glyph={slot.glyph}
              label={slot.label}
              selected={active === slot.name}
              background={active === slot.name ? T.accent : idle}
              color={active === slot.name ? T.onAccent : idleIcon}
              onPress={() => onSelect(slot.name)}
              t={slotProximity(scrollX, i)}
            />
          ),
        )}
      </div>
    </div>
  )
}

/** Mobile's AddHalo: a soft ring breathing out from the add circle. Reduced motion keeps it still. */
function AddHalo({ color }: { color: string }) {
  const reduced = useReducedMotion()
  return <motion.span
    data-testid="nav-add-hint"
    aria-hidden="true"
    style={{ position: 'absolute', left: (SLOT - CIRCLE) / 2, top: (RING_SIZE - CIRCLE) / 2, width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, background: color, pointerEvents: 'none' }}
    initial={false}
    animate={reduced ? { opacity: 0.3, scale: 1.2 } : { opacity: [0.45, 0], scale: [1, 1.45] }}
    transition={reduced ? { duration: 0 } : { duration: 1.4, ease: 'easeOut', repeat: Infinity }}
  />
}

function NavCircle({
  glyph: GlyphIcon,
  label,
  selected,
  background,
  color,
  onPress,
  disabled = false,
  overrideContent,
  t,
  floating = false,
}: {
  glyph: Glyph
  label: string
  selected: boolean
  background: string
  color: string
  onPress: () => void
  disabled?: boolean
  overrideContent?: ReactNode
  t: number
  floating?: boolean
}) {
  const [pressed, setPressed] = useState(false)
  const release = () => setPressed(false)
  return (
    <div style={{ width: SLOT, flexShrink: 0, ...row, justifyContent: 'center', scrollSnapAlign: 'center' }}>
      <motion.div
        animate={{ scale: pressed ? 0.88 : 1 }}
        transition={pressed ? springTight : spring}
        style={{ width: RING_SIZE, height: RING_SIZE }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            ...row,
            justifyContent: 'center',
            transform: `scale(${1 - t * (1 - INACTIVE_SCALE)})`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: RING_SIZE / 2,
              border: `${RING_WIDTH}px solid ${T.accent}`,
              opacity: selected ? 1 : 0,
              transition: 'opacity 200ms',
              pointerEvents: 'none',
            }}
          />
          <button
            type="button"
            role="tab"
            aria-label={label}
            aria-selected={selected}
            disabled={disabled}
            onPointerDown={() => setPressed(true)}
            onPointerUp={release}
            onPointerLeave={release}
            onPointerCancel={release}
            onClick={onPress}
            style={{
              ...pressable,
              cursor: disabled ? 'default' : 'pointer',
              width: CIRCLE,
              height: CIRCLE,
              borderRadius: CIRCLE / 2,
              ...row,
              justifyContent: 'center',
              background,
              transition: 'background-color 200ms',
              opacity: 1 - t * 0.35,
              boxShadow: selected || floating ? elevation.floating : elevation.card,
            }}
          >
            {overrideContent ?? <GlyphIcon size={ICON} color={color} weight={selected ? 'fill' : 'regular'} />}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── AddCircleAnim ───────────────────────────────────────────────────────────

const BOX = 64
const RING_R = (BOX - 3) / 2
const RING_CIRC = 2 * Math.PI * RING_R
const PARTICLE_EASE = [0.2, 0.7, 0.3, 1] as const
const SNAP_EASE = [0.2, 0.9, 0.25, 1] as const

const PARTICLES = [
  { angle: 0, delay: 60, duration: 720, width: 7, height: 7, color: '#ffdecd' },
  { angle: 45, delay: 135, duration: 770, width: 5, height: 11, color: 'rgba(255, 250, 245, 0.75)' },
  { angle: 90, delay: 85, duration: 710, width: 7, height: 7, color: '#ffdecd' },
  { angle: 135, delay: 180, duration: 750, width: 5, height: 11, color: 'rgba(255, 250, 245, 0.75)' },
  { angle: 180, delay: 110, duration: 740, width: 7, height: 7, color: '#ffdecd' },
  { angle: 225, delay: 155, duration: 780, width: 5, height: 11, color: 'rgba(255, 250, 245, 0.75)' },
  { angle: 270, delay: 70, duration: 700, width: 7, height: 7, color: '#ffdecd' },
  { angle: 315, delay: 145, duration: 760, width: 5, height: 11, color: 'rgba(255, 250, 245, 0.75)' },
]

const box: CSSProperties = { width: BOX, height: BOX, position: 'relative', ...row, justifyContent: 'center', pointerEvents: 'none' }
const disc: CSSProperties = { position: 'absolute', width: BOX - 8, height: BOX - 8, borderRadius: (BOX - 8) / 2 }
const fill: CSSProperties = { position: 'absolute', inset: 0 }

/** Load phase: plus spins away, a ripple fades off the disc, a ring sweeps round. */
function AddCircleLoad({ discColor, iconColor }: { discColor: string; iconColor: string }) {
  return (
    <div style={box}>
      <motion.div
        style={{ ...disc, background: discColor }}
        initial={{ opacity: 0.35 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.6, ease: SNAP_EASE }}
      />
      <div style={{ ...disc, background: discColor }} />
      <motion.div
        style={{ display: 'flex' }}
        initial={{ opacity: 1, rotate: 0 }}
        animate={{ opacity: 0, rotate: 135 }}
        transition={{ duration: 0.34, ease: [0.5, 0, 0.2, 1] }}
      >
        <PlusGlyph size={22} color={iconColor} />
      </motion.div>
      <motion.div
        style={fill}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1] }}
        transition={{ duration: 0.3, times: [0, 0.3, 1], ease: SNAP_EASE }}
      >
        <motion.div style={fill} animate={{ rotate: 360 }} transition={{ duration: 1.6, ease: 'linear', repeat: Infinity }}>
          <svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`}>
            <circle cx={BOX / 2} cy={BOX / 2} r={RING_R} fill="none" stroke={iconColor} strokeOpacity={0.22} strokeWidth={3} />
            <motion.circle
              cx={BOX / 2}
              cy={BOX / 2}
              r={RING_R}
              fill="none"
              stroke={discColor}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              initial={{ strokeDashoffset: RING_CIRC }}
              animate={{ strokeDashoffset: [RING_CIRC, RING_CIRC * (26 / 214), RING_CIRC * (18 / 214)] }}
              transition={{ duration: 0.72, times: [0, 0.92, 1], ease: [0.45, 0.05, 0.35, 1] }}
            />
          </svg>
        </motion.div>
      </motion.div>
    </div>
  )
}

/** Done phase: radial particle burst and halo behind a mint disc while the tick draws. */
function AddCircleDone({ discColor, checkColor }: { discColor: string; checkColor: string }) {
  return (
    <div style={box}>
      <motion.div
        style={{ ...disc, border: `3px solid ${discColor}` }}
        initial={{ opacity: 0.55 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.62, ease: PARTICLE_EASE }}
      />
      <div style={fill}>
        {PARTICLES.map((p) => (
          <div key={p.angle} style={{ position: 'absolute', left: '50%', top: '50%', transform: `rotate(${p.angle}deg)` }}>
            <motion.div
              style={{
                position: 'absolute',
                width: p.width,
                height: p.height,
                marginLeft: -p.width / 2,
                borderRadius: 100,
                background: p.color,
              }}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 1, 1, 0], y: [0, -38, -52] }}
              transition={{
                delay: p.delay / 1000,
                duration: p.duration / 1000,
                ease: PARTICLE_EASE,
                opacity: { times: [0, 0.25, 0.6, 1], delay: p.delay / 1000, duration: p.duration / 1000 },
                y: { times: [0, 0.6, 1], delay: p.delay / 1000, duration: p.duration / 1000, ease: PARTICLE_EASE },
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ ...disc, background: discColor }} />
      <div style={{ position: 'relative', display: 'flex' }}>
        <CheckIcon color={checkColor} size={22} />
      </div>
    </div>
  )
}
