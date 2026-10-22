'use client'

import { useEffect, type ReactNode } from 'react'
import { useCurrency } from '@/src/context/CurrencyContext'
import { XIcon } from '@/src/components/icons'
import { Scrim, Sheet } from './MotionSheet'

/** The labelled-form modal: money screens (see MoneyScreens' FormSheet, which
 * adds the read-only notice) and onboarding's plan amounts. */
export function AmountSheet({ title, onClose, onBack, busy, footer, className = '', replaceBody, children }: {
  title: string
  onClose: () => void
  /** Where Escape goes instead of closing (move money's sources step). */
  onBack?: () => void
  busy: boolean
  footer?: ReactNode
  className?: string
  /** Shown instead of the body and footer, e.g. a read-only notice. */
  replaceBody?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) (onBack ?? onClose)()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onBack, onClose])
  return (
    <Scrim className="erd-modal-overlay" onClick={busy ? undefined : onClose}>
      <Sheet className={`erd-modal-card erd-sub-card erd-one-off-card ${className}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="erd-modal-head">
          <h3>{title}</h3>
          <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close" disabled={busy}>
            <XIcon size={18} />
          </button>
        </div>
        {replaceBody ?? <>
          <div className="erd-sub-body">{children}</div>
          {footer && <div className="erd-sub-footer">{footer}</div>}
        </>}
      </Sheet>
    </Scrim>
  )
}

/** "Amount" with the currency glued to the digits and a hint underneath. */
export function AmountField({ id, value, onChange, hint, warn, autoFocus, children }: {
  id: string
  value: string
  onChange: (value: string) => void
  hint: string
  /** Over what's available: the hint goes coral. */
  warn?: boolean
  autoFocus?: boolean
  /** Quick picks under the hint. */
  children?: ReactNode
}) {
  const { currencySymbol } = useCurrency()
  return (
    <section className="erd-sub-section">
      <label className="erd-log-label" htmlFor={id}>Amount</label>
      <div className="erd-amount-field">
        <span className="erd-amount-symbol" aria-hidden="true">{currencySymbol}</span>
        <input
          id={id}
          className="erd-amount-input"
          type="text"
          inputMode="decimal"
          placeholder="0"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            if (/^\d{0,9}(\.\d{0,2})?$/.test(e.target.value)) onChange(e.target.value)
          }}
        />
      </div>
      <p className={`erd-sub-hint ${warn ? 'is-neg' : ''}`}>{hint}</p>
      {children}
    </section>
  )
}
