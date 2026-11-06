import { PlantIcon } from '@/src/components/icons'
import { CheckIcon } from '@/src/components/landing/mobile/kit'
import { useButtonPhase } from '@/src/components/SuccessButton'

/**
 * The month-start moment, in the same green strip the old "went to savings"
 * note used: one line on what last month left behind. Tapping the line plays
 * the categories' roll-in again (`onReplay`), for anyone who missed it.
 * Nothing to decide, so "Nice" just plays the shared check and `onDone` hides
 * it for good.
 */
export function RolloverCard({ text, onReplay, onDone }: { text: string; onReplay: () => void; onDone: () => void }) {
  const phase = useButtonPhase()
  // "· ₹X short" (src/lib/rollover.ts): mixed news, so a calm card and "Got it", not green "Nice".
  const short = / short\b/.test(text)
  const label = short ? 'Got it' : 'Nice'
  return (
    <article className={`erd-card home-leftover-notice${short ? ' is-short' : ''}`}>
      <button type="button" className="home-leftover-replay" onClick={onReplay} title="Show it again">
        <PlantIcon size={18} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />{text}
      </button>
      <button type="button" aria-label={label} disabled={phase.success} onClick={() => phase.succeed(onDone)}>
        {phase.success ? <CheckIcon color="var(--mint)" size={18} /> : label}
      </button>
    </article>
  )
}
