import type { CSSProperties } from 'react'

/** Mobile's splash/BirdLandingMark.tsx outline, shared by the static and thinking marks. */
export const BIRD_PATH =
  'M 352 212 L 404 248 L 352 284 A 110 110 0 0 1 146 288 L 86 164 L 162 178 A 110 110 0 0 1 352 212 Z M 287 216 A 19 19 0 1 1 325 216 A 19 19 0 1 1 287 216 Z'

export function Bird() {
  return (
    <>
      <rect x="224" y="340" width="17" height="46" rx="8.5" />
      <rect x="259" y="340" width="17" height="46" rx="8.5" />
      <path fillRule="evenodd" d={BIRD_PATH} />
    </>
  )
}

/** The bird alone (no perch, eye left out) for SignInFlight, which cuts the eye with its own blinking mask. */
export const BIRD_BODY_PATH = BIRD_PATH.slice(0, BIRD_PATH.indexOf(' M 287'))

/**
 * Static twin of Mobile's splash/BirdLandingMark.tsx artwork, painted in currentColor.
 * `flightTarget` marks it as a perch SignInFlight can land on; the perch and
 * bird are separate groups so the landing can squash one and dip the other.
 */
export function BirdMark({ size, flightTarget = false, perched = false }: { size: number; flightTarget?: boolean; perched?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="currentColor"
      aria-hidden="true"
      data-flight-target={flightTarget || undefined}
      style={flightTarget ? { overflow: 'visible' } : undefined}
    >
      <g data-perch>
        <rect x="128" y="379" width="256" height="26" rx="13" />
      </g>
      <g data-bird>
        {perched ? (
          <>
            <rect x="224" y="340" width="17" height="46" rx="8.5" />
            <rect x="259" y="340" width="17" height="46" rx="8.5" />
            <g className="bird-idle-head">
              <path fillRule="evenodd" d={BIRD_PATH} />
              <rect className="bird-idle-eyelid" x="287" y="197" width="38" height="38" rx="19" />
            </g>
          </>
        ) : <Bird />}
      </g>
    </svg>
  )
}

/** Money Brain's "thinking" mark: the perched bird pecks twice, rests, repeats. Motion lives in `.brain-thinking` CSS. */
export function BirdThinking({ size }: { size: number }) {
  return (
    <svg className="brain-thinking" width={size} height={size} viewBox="0 0 512 512" fill="currentColor" role="img" aria-label="Thinking">
      <rect x="128" y="379" width="256" height="26" rx="13" />
      <g className="brain-thinking-bird"><Bird /></g>
    </svg>
  )
}

/** Motes that pop off the perch as the bird touches down; same offsets as Mobile's MOTES. */
const MOTES = [
  { cx: 238, cy: 374, r: 9, dx: -58, dy: -46, delay: 0.98 },
  { cx: 276, cy: 374, r: 7, dx: 52, dy: -58, delay: 1 },
  { cx: 256, cy: 372, r: 5.5, dx: 14, dy: -72, delay: 1.04 },
]

/** Web twin of Mobile's BirdLandingMark: perch grows in, bird swoops down and lands, motes pop, then it breathes. Motion lives in `.bird-landing` CSS. */
export function BirdLanding({ size }: { size: number }) {
  return (
    <svg className="bird-landing" width={size} height={size} viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <circle className="bird-landing-ring" cx="256" cy="392" r="58" fill="none" stroke="currentColor" strokeWidth="7" />
      <g className="bird-landing-dip"><rect className="bird-landing-bar" x="128" y="379" width="256" height="26" rx="13" /></g>
      <g className="bird-landing-swoop"><g className="bird-landing-squash"><g className="bird-landing-breathe"><Bird /></g></g></g>
      {MOTES.map((m) => (
        <circle key={m.cx} className="bird-landing-mote" cx={m.cx} cy={m.cy} r={m.r}
          style={{ '--dx': `${m.dx}px`, '--dy': `${m.dy}px`, animationDelay: `${m.delay}s` } as CSSProperties} />
      ))}
    </svg>
  )
}
