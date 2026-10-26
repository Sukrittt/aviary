import { CheckIcon } from '@/src/components/landing/mobile/kit'
import { useButtonPhase } from '@/src/components/SuccessButton'

/**
 * Monday's peak: last week closes on its best fact, in the rollover strip's
 * green when it went well. "Nice" plays the shared check and `onDone` hides it
 * for the week. Twin of Mobile's recap card on Home (app/(tabs)/index.tsx).
 */
export function WeeklyRecapCard({ title, detail, tone, onDone }: { title: string; detail: string; tone: 'good' | 'calm'; onDone: () => void }) {
  const phase = useButtonPhase()
  const label = tone === 'good' ? 'Nice' : 'Got it'
  return (
    <article className={`erd-card home-leftover-notice home-weekly-recap ${tone === 'calm' ? 'is-calm' : ''}`}>
      <span className="home-weekly-recap-text">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
      <button type="button" aria-label={label} disabled={phase.success} onClick={() => phase.succeed(onDone)}>
        {phase.success ? <CheckIcon color={tone === 'good' ? 'var(--mint)' : 'var(--erd-text)'} size={18} /> : label}
      </button>
    </article>
  )
}
