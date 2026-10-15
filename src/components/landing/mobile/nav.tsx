'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { HouseIcon, PlusIcon, ReceiptIcon, SquaresFourIcon, UserIcon, type PhosphorIcon, type IconWeight } from '@/src/components/icons'
import { CheckIcon, PHONE, T, font, pressable, row, spring, springTight, useShake } from './kit'

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
const EnvelopeGlyph = glyph(SquaresFourIcon)
const ProfileGlyph = glyph(UserIcon)
const PlusGlyph: Glyph = ({ size, color }) => <PlusIcon size={size} weight="bold" style={fade(color, 'fill')} />

const NAV_ROUTES: { name: NavRoute; glyph: Glyph; label: string }[] = [
  { name: 'index', glyph: HomeGlyph, label: 'Home' },
  { name: 'activity', glyph: ActivityGlyph, label: 'Activity' },
  { name: 'envelopes', glyph: EnvelopeGlyph, label: 'Categories' },
  { name: 'more', glyph: ProfileGlyph, label: 'More' },
]

const BAR = 56
const PILL_PAD = 5
const TAB_W = 56
const TAB_H = BAR - 2 * PILL_PAD
const ICON = 26
const NAV_SIDE = 16
const ROW_HEIGHT = BAR + 16 + 28
const NAV_BOTTOM_GAP = 10

/**
 * One pill holding the four tabs, and the add action as its own disc beside
 * it. On log-expense (`addActive`) the pill goes tone-on-tone over the accent
 * flood and the disc turns white: it's the save button there.
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
  onSelect: (name: NavRoute) => void
  onAdd: () => void
  addActive?: boolean
  addSaving?: boolean
  addSuccess?: boolean
  addInvalid?: boolean
  addDisabled?: boolean
  /** Meaningful only when addActive: a first-timer's form is ready, so pulse the add disc and say it saves. */
  addHint?: boolean
}) {
  const [shakeRef, shake] = useShake<HTMLDivElement>()
  const idleIcon = addActive ? 'rgba(255, 255, 255, 0.7)' : T.text3
  const disabled = addActive && (addDisabled || addSaving || addSuccess)
  const dimmed = addActive && (addInvalid || disabled)
  const index = NAV_ROUTES.findIndex((r) => r.name === active)

  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: NAV_BOTTOM_GAP }}>
      <div style={{ ...row, justifyContent: 'space-between', height: ROW_HEIGHT + PHONE.bottom, paddingInline: NAV_SIDE }}>
        <div
          data-testid="nav-pill"
          style={{
            ...row,
            position: 'relative',
            height: BAR,
            padding: PILL_PAD,
            borderRadius: BAR / 2,
            ...(addActive ? { background: 'rgba(255, 255, 255, 0.2)' } : { background: T.cardSolid, border: `1px solid ${T.borderStrong}` }),
          }}
        >
          <motion.div
            aria-hidden="true"
            initial={false}
            animate={{ opacity: index >= 0 ? 1 : 0, x: Math.max(index, 0) * TAB_W }}
            transition={{ duration: 0.11, ease: [0.33, 1, 0.68, 1] }}
            style={{ position: 'absolute', left: PILL_PAD, top: PILL_PAD, width: TAB_W, height: TAB_H, borderRadius: TAB_H / 2, background: T.accentSoft }}
          />
          {NAV_ROUTES.map(({ name, glyph: GlyphIcon, label }) => (
            <button
              key={name}
              type="button"
              aria-label={label}
              aria-current={active === name ? 'page' : undefined}
              onClick={() => onSelect(name)}
              style={{ ...pressable, position: 'relative', width: TAB_W, height: TAB_H, ...row, justifyContent: 'center' }}
            >
              <GlyphIcon size={ICON} color={active === name ? T.accent : idleIcon} weight={active === name ? 'fill' : 'regular'} />
            </button>
          ))}
        </div>
        <div ref={shakeRef} style={{ position: 'relative' }}>
          {addActive && addHint && (
            <div style={{ position: 'absolute', right: 0, bottom: BAR + 12, width: 200, ...row, justifyContent: 'flex-end', pointerEvents: 'none' }}>
              <span style={{ color: T.onAccent, ...font.bodySemiBold, fontSize: 13, padding: '5px 12px', borderRadius: 999, background: 'rgba(0, 0, 0, 0.22)' }}>Tap + to save</span>
            </div>
          )}
          {addActive && addHint && <AddHalo color={T.onAccent} />}
          <AddDisc
            // On the accent flood an accent disc would vanish, so it inverts: white disc, accent plus.
            background={addActive ? (addSuccess ? T.successBg : '#ffffff') : T.accent}
            color={addActive ? T.accent : T.onAccent}
            onPress={() => (addActive && addInvalid ? shake() : onAdd())}
            disabled={disabled}
            dimmed={dimmed}
            overrideContent={
              addActive && addSuccess ? (
                <AddCircleDone discColor={T.successBg} checkColor={T.onSuccess} />
              ) : addActive && addSaving ? (
                <AddCircleLoad discColor="#ffffff" iconColor={T.accent} />
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  )
}

/** Mobile's AddHalo: a soft ring breathing out from the add disc. Reduced motion keeps it still. */
function AddHalo({ color }: { color: string }) {
  const reduced = useReducedMotion()
  return <motion.span
    data-testid="nav-add-hint"
    aria-hidden="true"
    style={{ position: 'absolute', left: 0, top: 0, width: BAR, height: BAR, borderRadius: BAR / 2, background: color, pointerEvents: 'none' }}
    initial={false}
    animate={reduced ? { opacity: 0.3, scale: 1.2 } : { opacity: [0.45, 0], scale: [1, 1.45] }}
    transition={reduced ? { duration: 0 } : { duration: 1.4, ease: 'easeOut', repeat: Infinity }}
  />
}

function AddDisc({
  background,
  color,
  onPress,
  disabled,
  dimmed,
  overrideContent,
}: {
  background: string
  color: string
  onPress: () => void
  disabled: boolean
  dimmed: boolean
  overrideContent?: ReactNode
}) {
  const [pressed, setPressed] = useState(false)
  const release = () => setPressed(false)
  return (
    <motion.button
      type="button"
      aria-label="Log expense"
      disabled={disabled}
      onPointerDown={() => setPressed(true)}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onClick={onPress}
      animate={{ scale: pressed ? 0.88 : 1 }}
      transition={pressed ? springTight : spring}
      style={{
        ...pressable,
        position: 'relative',
        cursor: disabled ? 'default' : 'pointer',
        width: BAR,
        height: BAR,
        borderRadius: BAR / 2,
        ...row,
        justifyContent: 'center',
        background,
        transition: 'background-color 200ms',
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {overrideContent ?? <PlusGlyph size={ICON} color={color} />}
    </motion.button>
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
