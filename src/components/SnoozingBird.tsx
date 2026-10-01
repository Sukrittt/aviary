import { BIRD_BODY_PATH } from './BirdMark'

/** Mobile's quiet-month mascot, with a nodding head and drifting z's. */
export function SnoozingBird({ size = 112 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="40 40 460 460" className="snoozing-bird" aria-hidden="true">
      <g fill="var(--erd-text)">
        <rect x="224" y="340" width="17" height="46" rx="8.5" />
        <rect x="259" y="340" width="17" height="46" rx="8.5" />
        <rect x="128" y="379" width="256" height="26" rx="13" />
      </g>
      <g className="snoozing-bird-head">
        <path d={BIRD_BODY_PATH} fill="var(--erd-text)" />
        <path d="M 288 216 Q 306 234 324 216" fill="none" stroke="var(--erd-card-solid)" strokeWidth="10" strokeLinecap="round" />
      </g>
      <g fill="none" stroke="var(--gold)" strokeLinecap="round" strokeLinejoin="round">
        <path className="snoozing-bird-z" d="M 380 140 H 420 L 380 180 H 420" strokeWidth="13" />
        <path className="snoozing-bird-z is-small" d="M 416 120 H 442 L 416 146 H 442" strokeWidth="10" />
      </g>
    </svg>
  )
}
