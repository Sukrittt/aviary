import { useEffect, useId, useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import { Scrim, Sheet } from './MotionSheet'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useDeleteExpense, useDismissDuplicate } from '../hooks/useExpenses'
import type { DuplicatePair } from '../api/expenses'
import type { ExpenseRow } from '../types'
import { formatShortDate } from '../lib/format'
import { track } from '../lib/analytics'
import { SuccessButton, useButtonPhase } from './SuccessButton'

function when(row: ExpenseRow): string {
  const time = new Date(row.timestamp)
  return Number.isNaN(time.getTime())
    ? formatShortDate(row.date)
    : `${formatShortDate(row.date)}, ${time.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
}

/**
 * Steps through flagged pairs one at a time: delete the newer copy, or keep
 * both. Delete plays the shared saving then tick sequence on the pair it acted
 * on, then moves to the next pair, or closes once none are left. Answered pairs
 * are hidden locally, so a refetch that lands late can't show one again.
 */
export function DuplicateReviewDialog({ pairs, onClose }: { pairs: DuplicatePair[]; onClose: () => void }) {
  const { formatCurrency } = useCurrency()
  const deleteExpense = useDeleteExpense()
  const dismiss = useDismissDuplicate()
  const deletePhase = useButtonPhase()
  const [failed, setFailed] = useState(false)
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set())
  // The pair on screen stays put while its delete saves and ticks, even after
  // the refetch has already dropped it from `pairs`.
  const [held, setHeld] = useState<DuplicatePair | null>(null)
  const id = useId()
  const primary = useRef<HTMLButtonElement>(null)
  const pair = held ?? pairs.find((p) => !answered.has(String(p.duplicate.id)))
  const busy = deletePhase.phase !== 'idle' || dismiss.isPending

  useEffect(() => {
    if (!pair) onClose()
  }, [pair, onClose])
  useEffect(() => primary.current?.focus(), [pair?.duplicate.id])

  if (!pair) return null
  const { duplicate, original } = pair
  // Closing on the last pair leaves it on screen, so the sheet has something to
  // animate out instead of blanking first.
  const isLast = !pairs.some((p) => p.duplicate.id !== duplicate.id && !answered.has(String(p.duplicate.id)))
  const answer = () => setAnswered((prev) => new Set(prev).add(String(duplicate.id)))

  async function handleDelete() {
    setFailed(false)
    setHeld(pair!)
    deletePhase.start()
    try {
      await deleteExpense.mutateAsync({
        id: duplicate.id,
        version: duplicate.version,
        timestamp: duplicate.timestamp,
        item: duplicate.item,
        amountInr: Number(duplicate.amount_inr) || 0,
      })
      track('duplicates_resolved', { action: 'deleted' })
      deletePhase.succeed(() => {
        if (isLast) return onClose()
        answer()
        setHeld(null)
      })
    } catch {
      deletePhase.fail()
      setHeld(null)
      setFailed(true)
    }
  }

  async function handleKeepBoth() {
    setFailed(false)
    try {
      await dismiss.mutateAsync(String(duplicate.id))
      track('duplicates_resolved', { action: 'kept_both' })
      if (isLast) onClose()
      else answer()
    } catch {
      setFailed(true)
    }
  }

  const rows: [string, (r: ExpenseRow) => string][] = [
    ['Item', (r) => r.item],
    ['Amount', (r) => formatCurrency(Number(r.amount_inr) || 0)],
    ['Logged', when],
    ['Category', (r) => r.category],
  ]

  return (
    <Scrim className="category-manager-overlay" style={{ zIndex: 210 }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <Sheet className="category-manager subscription-modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
        <div className="txn-review">
          <span className="txn-review-icon" aria-hidden="true"><Copy size={22} /></span>
          <h4 id={`${id}-title`}>Logged twice?</h4>
          <p className="txn-review-intro">
            These look like the same purchase.{pairs.length > 1 ? ` ${pairs.length} to review.` : ''}
          </p>
          <div className="txn-review-comparison">
            <div className="txn-review-columns"><span>Earlier</span><span>Newer</span></div>
            {rows.map(([label, value]) => (
              <div className="txn-review-row" key={label}>
                <div className="txn-review-label">{label}</div>
                <div className="txn-review-values"><span>{value(original)}</span><span>{value(duplicate)}</span></div>
              </div>
            ))}
          </div>
          {failed && <p className="txn-review-note" role="alert">That didn&apos;t go through. It may have changed on another device; try again.</p>}
          <div className="txn-review-actions">
            <SuccessButton type="button" ref={primary} baseClass="txn-review-primary" disabled={busy}
              saving={deletePhase.saving} success={deletePhase.success} savingLabel="Deleting…" successLabel="Deleted"
              onClick={handleDelete}>
              Delete the newer one
            </SuccessButton>
            <button type="button" className="txn-review-secondary" disabled={busy} onClick={handleKeepBoth}>
              Keep both
            </button>
          </div>
        </div>
      </Sheet>
    </Scrim>
  )
}
