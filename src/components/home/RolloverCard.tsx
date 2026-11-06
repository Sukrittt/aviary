import { Fragment } from 'react'
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
export function RolloverCard({ text, detail, onReplay, onDone }: { text: string; detail?: string | null; onReplay: () => void; onDone: () => void }) {
  const phase = useButtonPhase()
  // "· ₹X short" (src/lib/rollover.ts): mixed news, so a calm card and "Got it", not green "Nice".
  const short = / short\b/.test(text)
  const label = short ? 'Got it' : 'Nice'
  return (
    <article className={`erd-card home-leftover-notice${short ? ' is-short' : ''}`}>
      <button type="button" className="home-leftover-replay" onClick={onReplay} title="Show it again">
        <PlantIcon size={18} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />
        {/* Each half stays whole, so a narrow screen breaks the line at the dot. */}
        {text.split(' · ').map((part, i) => (
          <Fragment key={i}>
            {i > 0 && ' · '}
            <span style={{ whiteSpace: 'nowrap' }}>{part}</span>
          </Fragment>
        ))}
        {/* What no category row shows, so the total can be checked against them. */}
        {detail && (
          <small className="home-leftover-detail">
            {detail.split(' · ').map((part, i) => (
              <Fragment key={i}>
                {i > 0 && ' · '}
                <span style={{ display: 'inline-block' }}>{part}</span>
              </Fragment>
            ))}
          </small>
        )}
      </button>
      <button type="button" aria-label={label} disabled={phase.success} onClick={() => phase.succeed(onDone)}>
        {phase.success ? <CheckIcon color="var(--mint)" size={18} /> : label}
      </button>
    </article>
  )
}
