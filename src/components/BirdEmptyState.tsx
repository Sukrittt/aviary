import type { CSSProperties } from 'react'
import {
  Archive,
  ChartNoAxesColumnIncreasing,
  FolderOpen,
  MessageCircle,
  ReceiptText,
  Repeat2,
  ScanLine,
  type LucideIcon,
} from 'lucide-react'
import { BIRD_BODY_PATH, BirdMark } from './BirdMark'
import { SnoozingBird } from './SnoozingBird'
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

const SUBJECT_ICONS: Record<Subject, LucideIcon> = {
  expenses: ReceiptText,
  subscriptions: Repeat2,
  holdings: ChartNoAxesColumnIncreasing,
  recurring: Repeat2,
  scans: ScanLine,
  chat: MessageCircle,
  archive: Archive,
  envelopes: FolderOpen,
  insights: ChartNoAxesColumnIncreasing,
}

const SUBJECT_MOODS: Record<Subject, Mood> = {
  expenses: 'clear',
  subscriptions: 'snoozing',
  holdings: 'clear',
  recurring: 'snoozing',
  scans: 'searching',
  chat: 'clear',
  archive: 'clear',
  envelopes: 'clear',
  insights: 'searching',
}

function SearchingBird({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="40 40 460 460" aria-hidden="true">
      <g fill="var(--erd-text)">
        <rect x="224" y="340" width="17" height="46" rx="8.5" />
        <rect x="259" y="340" width="17" height="46" rx="8.5" />
        <rect x="128" y="379" width="256" height="26" rx="13" />
        <path d={BIRD_BODY_PATH} />
      </g>
      <circle cx="306" cy="216" r="19" fill="var(--erd-card-solid)" />
      <g className={styles.searchLens} fill="none" stroke="var(--gold)" strokeLinecap="round">
        <circle cx="306" cy="216" r="42" strokeWidth="14" />
        <path d="M 337 247 L 378 288" strokeWidth="18" />
      </g>
    </svg>
  )
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
  const SubjectIcon = SUBJECT_ICONS[subject]
  const birdSize = compact ? 84 : 112
  const resolvedMood = mood ?? SUBJECT_MOODS[subject]

  return (
    <div className={`${styles.root} ${compact ? styles.compact : ''} ${className}`.trim()} style={style}>
      <div className={`${styles.scene} ${styles[`subject_${subject}`]} ${styles[`mood_${resolvedMood}`]}`} aria-hidden="true">
        <div className={styles.halo} />
        <div className={styles.orbit} />
        <div className={styles.ground} />
        <div className={styles.bird}>
          <div className={styles.birdMotion}>
            {resolvedMood === 'searching' ? (
              <SearchingBird size={birdSize} />
            ) : resolvedMood === 'clear' ? (
              <BirdMark size={birdSize} />
            ) : (
              <SnoozingBird size={birdSize} />
            )}
          </div>
        </div>
        <div className={`${styles.prop} ${styles[`prop_${subject}`]}`}>
          <span className={styles.propMotion}><SubjectIcon strokeWidth={1.8} /></span>
        </div>
        <div className={`${styles.dot} ${styles.dotOne}`} />
        <div className={`${styles.dot} ${styles.dotTwo}`} />
      </div>
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
