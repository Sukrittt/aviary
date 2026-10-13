import { useEffect, useId, useRef } from 'react'
import { ArrowLeftIcon, ArrowClockwiseIcon } from '@/src/components/icons'
import { Scrim, Sheet } from './MotionSheet'
import { expenseNotice } from '../lib/expenseNotice'

export function ExpenseNoticeDialog({ status, action, onBack }: { status?: number; action: 'edit' | 'delete'; onBack: () => void }) {
  const copy = expenseNotice(status, action)
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    button.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  return (
    <Scrim className="category-manager-overlay" style={{ zIndex: 210 }} onClick={(event) => { if (event.target === event.currentTarget) onBack() }}>
      <Sheet className="category-manager subscription-modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.stopPropagation(); onBack() }
          if (event.key === 'Tab') { event.preventDefault(); button.current?.focus() }
        }}>
        <div className="txn-review txn-review-notice">
          <span className="txn-review-icon" aria-hidden="true"><ArrowClockwiseIcon size={24} /></span>
          <h4 id={`${id}-title`}>{copy.title}</h4>
          <p className="txn-review-intro" id={`${id}-description`}>{copy.message}</p>
          <div className="txn-review-actions">
            <button type="button" ref={button} className="txn-review-primary" onClick={onBack}>
              <ArrowLeftIcon size={16} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 8 }} />{copy.backLabel}
            </button>
          </div>
        </div>
      </Sheet>
    </Scrim>
  )
}
