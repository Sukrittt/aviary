/**
 * Frame math for the post-sign-in bird: it pops up over the content, blinks
 * twice, turns around, and flies an arc onto the sidebar logo's perch.
 * Every value is a pure function of `t` (ms since start), so the component
 * only paints what this returns and tests can seek to any moment.
 */

export const FLIGHT_TIMELINE = {
  popEnd: 480,
  blink1: 640,
  blink2: 880,
  crouch: 1060, // anticipation squat + turn around
  takeoff: 1240,
  land: 1920, // the flying copy hands off to the real, perched logo
  end: 2400,
} as const

/** Popped size in px, before it shrinks down to the logo's size in flight. */
export const POPPED_SIZE = 122

export interface Point {
  x: number
  y: number
}

export interface FlightGeometry {
  /** Where the bird pops up (its centre). */
  origin: Point
  /** Centre of the logo it lands on. */
  target: Point
  /** Rendered width of that logo; the flyer's scale 1 matches it. */
  targetSize: number
}

export interface FlightFrame {
  flyer: {
    visible: boolean
    x: number // centre
    y: number
    scaleX: number // negative while facing left
    scaleY: number
    rotate: number // deg
    opacity: number
    /** 1 = eye open, 0 = shut. */
    eyeOpen: number
  }
  perched: {
    visible: boolean
    scaleX: number
    scaleY: number
    /** How far the perch dips on touchdown, in viewBox units. */
    perchDrop: number
  }
  scrim: number
}

const T = FLIGHT_TIMELINE

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, p: number) => a + (b - a) * p
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
const easeOutBack = (p: number, s = 1.9) => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2)
const easeOut = (p: number) => 1 - (1 - p) ** 3
const easeIn = (p: number) => p * p

/** Eye openness for one blink starting at `at`: shut in 70ms, open in 90ms. */
function blink(t: number, at: number) {
  if (t < at || t > at + 160) return 1
  return t < at + 70 ? 1 - easeIn(prog(t, at, at + 70)) : easeOut(prog(t, at + 70, at + 160))
}

export function flightFrame(t: number, { origin, target, targetSize }: FlightGeometry): FlightFrame {
  const big = POPPED_SIZE / targetSize
  let x = origin.x
  let y = origin.y
  let s = 0
  let sx = 1
  let sy = 1
  let rotate = 0
  let facing = 1
  let opacity = 1
  let eyeOpen = 1

  if (t < T.popEnd) {
    const p = prog(t, 0, T.popEnd)
    s = big * Math.max(0, easeOutBack(p))
    rotate = lerp(-14, 0, easeOut(p))
    opacity = clamp(t / 90)
    y += (1 - easeOut(p)) * 24
  } else if (t < T.takeoff) {
    s = big
    eyeOpen = Math.min(blink(t, T.blink1), blink(t, T.blink2))
    sy = 1 + Math.sin((t - T.popEnd) / 140) * 0.012 // idle breathing
    if (t >= T.crouch) {
      const p = prog(t, T.crouch, T.takeoff)
      const squat = Math.sin(p * Math.PI * 0.85)
      sy = 1 - 0.14 * squat
      sx = 1 + 0.08 * squat
      // It faces right and the sidebar is to its left, so it turns around first.
      facing = Math.cos(easeInOut(prog(t, T.crouch, T.crouch + 150)) * Math.PI)
      y += squat * 6
    }
  } else if (t < T.land) {
    const p = prog(t, T.takeoff, T.land)
    const e = easeInOut(p)
    // Quadratic arc that rises above both ends before dropping onto the perch.
    const cx = lerp(origin.x, target.x, 0.55)
    const cy = Math.min(origin.y, target.y) - 110
    x = (1 - e) ** 2 * origin.x + 2 * (1 - e) * e * cx + e * e * target.x
    y = (1 - e) ** 2 * origin.y + 2 * (1 - e) * e * cy + e * e * target.y
    y -= Math.sin(p * Math.PI * 5) * 7 * (1 - p) ** 2 // wingbeat bob, dies out on approach
    s = lerp(big, 1, easeInOut(p ** 0.85))
    const stretch = Math.sin(clamp(p * 3) * Math.PI) * 0.1
    sx = 1 + stretch
    sy = 1 - stretch * 0.6
    rotate = lerp(16, -6, e) * (1 - p ** 6) // nose up on launch, level on arrival
    facing = -1
  }

  const flying = t > 0 && t < T.land
  const landing = t >= T.land && t < T.end
  let perched = { visible: !flying, scaleX: 1, scaleY: 1, perchDrop: 0 }
  if (landing) {
    const q = (t - T.land) / 1000
    const k = Math.exp(-q * 9) * Math.sin(q * 34) // damped touchdown spring
    const turnBack = Math.cos((1 - easeInOut(prog(t, T.land + 140, T.land + 300))) * Math.PI)
    perched = { visible: true, scaleX: (1 + 0.16 * k) * turnBack, scaleY: 1 - 0.28 * k, perchDrop: Math.max(0, k) * 14 }
  }

  return {
    flyer: {
      visible: flying,
      x,
      y,
      scaleX: s * sx * facing,
      scaleY: s * sy,
      rotate,
      opacity: flying ? opacity : 0,
      eyeOpen: Math.max(0.08, eyeOpen),
    },
    perched,
    scrim: t > 0 && t < T.end ? Math.min(prog(t, 0, 260), 1 - prog(t, T.takeoff, T.takeoff + 420)) : 0,
  }
}
