import { useId, type CSSProperties, type ReactNode } from 'react'
import { BIRD_BODY_PATH, BIRD_PATH } from './BirdMark'
import styles from './BirdEmptyState.module.css'

type Mood = 'snoozing' | 'searching' | 'clear'
type Subject =
  | 'expenses'
  | 'subscriptions'
  | 'holdings'
  | 'recurring'
  | 'scans'
  | 'chat'
  | 'archive'
  | 'envelopes'
  | 'insights'
export type EmptyScene = Exclude<Subject, 'recurring'> | 'searching' | 'snoozing'

/** Searching wins for any subject; snoozing too, except subscriptions, which doze under their repeat arrow. */
export function sceneFor(subject: Subject, mood?: Mood): EmptyScene {
  if (mood === 'searching') return 'searching'
  if (subject === 'recurring' || (mood === 'snoozing' && subject !== 'subscriptions')) return 'snoozing'
  return subject
}

// Geometry and motion lifted from the approved Mobile prototype (512 artboard, props stroked ~13 in the bird's line language).
const VB = '30 70 480 370'
const VB_TALL = '30 70 480 400'

const legs = (
  <>
    <rect x="224" y="340" width="17" height="46" rx="8.5" />
    <rect x="259" y="340" width="17" height="46" rx="8.5" />
  </>
)
const perch = <rect x="128" y="379" width="256" height="26" rx="13" />
/** Awake bird; the eye is a true cut-out, so it reads on cards and pages alike. */
const body = <path fillRule="evenodd" d={BIRD_PATH} />

/** Dozing head: the shut-eye curve is masked out of the body so it matches whatever sits behind. */
function DozingHead({ id }: { id: string }) {
  return (
    <g className={styles.nod}>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="white" />
        <path d="M 288 216 Q 306 234 324 216" fill="none" stroke="black" strokeWidth="10" strokeLinecap="round" />
      </mask>
      <path d={BIRD_BODY_PATH} mask={`url(#${id})`} />
    </g>
  )
}

function SceneArt({ scene }: { scene: EmptyScene }) {
  const id = useId()
  const svg = (viewBox: string, children: ReactNode) => (
    <svg className={styles.art} viewBox={viewBox} fill="var(--erd-text)" aria-hidden="true" data-scene={scene}>{children}</svg>
  )

  switch (scene) {
    case 'searching':
      return svg(VB, <>
        {legs}{perch}{body}
        <g className={styles.lens} fill="none" stroke="var(--gold)" strokeLinecap="round">
          <circle cx="306" cy="216" r="42" strokeWidth="14" />
          <path d="M 337 247 L 378 288" strokeWidth="18" />
        </g>
      </>)
    case 'snoozing':
      return svg(VB, <>
        {legs}{perch}<DozingHead id={id} />
        <g fill="none" stroke="var(--gold)" strokeLinecap="round" strokeLinejoin="round">
          <path className={styles.z} d="M 380 140 H 420 L 380 180 H 420" strokeWidth="13" />
          <path className={`${styles.z} ${styles.zLate}`} d="M 416 120 H 442 L 416 146 H 442" strokeWidth="10" />
        </g>
      </>)
    case 'subscriptions':
      return svg(VB, <>
        {legs}{perch}<DozingHead id={id} />
        <g className={styles.spin} fill="none" stroke="var(--gold)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 452 150 A 38 38 0 1 1 420 120" />
          <path d="M 406 104 L 424 122 L 406 140" />
        </g>
      </>)
    case 'expenses':
      return svg(VB, <>
        {legs}{perch}
        <g className={styles.peck}>
          {body}
          <circle className={styles.blink} cx="306" cy="216" r="20" />
        </g>
        <g className={styles.coin} fill="none" stroke="var(--gold)" strokeLinecap="round">
          <circle cx="452" cy="340" r="38" strokeWidth="13" />
          <path d="M 452 322 V 358" strokeWidth="12" />
        </g>
      </>)
    case 'holdings':
      return svg(VB_TALL, <>
        <g transform="translate(15 -8)">{legs}<g className={styles.bob}>{body}</g></g>
        <g fill="var(--mint)">
          <rect className={styles.bar} x="60" y="440" width="70" height="30" rx="12" />
          <rect className={styles.bar} x="145" y="410" width="70" height="60" rx="12" />
          <rect className={styles.bar} x="230" y="378" width="70" height="92" rx="12" />
        </g>
      </>)
    case 'scans':
      return svg(VB, <>
        {legs}{perch}{body}
        <g fill="none" stroke="var(--gold)" strokeWidth="14" strokeLinecap="round">
          <path d="M 70 150 V 110 H 110" />
          <path d="M 430 110 H 470 V 150" />
          <path d="M 470 400 V 440 H 430" />
          <path d="M 110 440 H 70 V 400" />
        </g>
        <rect className={styles.scanline} x="80" y="135" width="380" height="12" rx="6" fill="var(--gold)" opacity=".85" />
      </>)
    case 'chat':
      return svg(VB, <>
        {legs}{perch}<g className={styles.bob}>{body}</g>
        <path d="M 392 96 H 496 A 18 18 0 0 1 514 114 V 164 A 18 18 0 0 1 496 182 H 430 L 404 204 V 182 H 392 A 18 18 0 0 1 374 164 V 114 A 18 18 0 0 1 392 96 Z"
          fill="none" stroke="var(--violet)" strokeWidth="13" strokeLinejoin="round" />
        <g fill="var(--violet)">
          <circle className={styles.dot} cx="418" cy="139" r="8" />
          <circle className={styles.dot} cx="444" cy="139" r="8" />
          <circle className={styles.dot} cx="470" cy="139" r="8" />
        </g>
      </>)
    case 'archive':
      return svg('30 40 480 400', <>
        <clipPath id={id}><rect width="600" height="300" /></clipPath>
        <g clipPath={`url(#${id})`}><g className={styles.peek}>{body}</g></g>
        <g fill="none" stroke="var(--blue)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 118 300 H 382 V 392 A 20 20 0 0 1 362 412 H 138 A 20 20 0 0 1 118 392 Z" />
          <path d="M 98 300 H 402" />
          <path d="M 226 348 H 274" strokeWidth="12" />
        </g>
      </>)
    case 'envelopes':
      return svg(VB_TALL, <>
        <g transform="translate(0 -40)">{legs}<g className={styles.tilt}>{body}</g></g>
        <g fill="none" stroke="var(--gold)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round">
          <rect x="128" y="345" width="256" height="118" rx="20" />
          <path d="M 136 358 L 256 420 L 376 358" />
        </g>
      </>)
    case 'insights':
      return svg(VB, <>
        {legs}{perch}<g className={styles.bob}>{body}</g>
        <g className={styles.qmark}>
          <path d="M 414 140 A 28 28 0 1 1 446 172 Q 440 180 440 196" fill="none" stroke="var(--gold)" strokeWidth="13" strokeLinecap="round" />
          <circle cx="440" cy="222" r="9" fill="var(--gold)" />
        </g>
      </>)
  }
}

export function BirdEmptyState({
  title,
  description,
  mood,
  subject = 'expenses',
  action,
  compact = false,
  className = '',
  style,
}: {
  title: string
  description: string
  mood?: Mood
  subject?: Subject
  action?: { label: string; onClick: () => void }
  compact?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={`${styles.root} ${compact ? styles.compact : ''} ${className}`.trim()} style={style}>
      <div className={styles.scene}><SceneArt scene={sceneFor(subject, mood)} /></div>
      <div className={styles.copy}>
        <div className={styles.title} role="heading" aria-level={3}>{title}</div>
        <p className={styles.description}>{description}</p>
        {action ? (
          <button type="button" className={`${styles.action} action-button is-active erd-accent-action`} onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  )
}
