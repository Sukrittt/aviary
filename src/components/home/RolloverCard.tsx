import { SuccessButton, useButtonPhase } from '@/src/components/SuccessButton'

/**
 * The month-start moment: one card saying what last month left behind. Nothing
 * to decide, so its one button just says "seen it" with the shared check beat
 * and `onDone` hides it for good once the beat has played.
 */
export function RolloverCard({ title, lines, onDone }: { title: string; lines: string[]; onDone: () => void }) {
  const phase = useButtonPhase()
  return (
    <article className="erd-card home-leftover-notice home-rollover-card">
      <div className="home-rollover-text">
        <strong>{title}</strong>
        {lines.map((line) => <span key={line}>{line}</span>)}
      </div>
      <SuccessButton
        type="button"
        baseClass="account-pill-btn"
        success={phase.success}
        successLabel="Got it"
        disabled={phase.success}
        onClick={() => phase.succeed(onDone)}
      >
        Got it
      </SuccessButton>
    </article>
  )
}
