'use client'

import { useCurrency } from '@/src/context/CurrencyContext'
import { motion } from 'motion/react'
import { STAGGER, popIn, staggerDelay } from '@/src/components/landing/mobile/kit'

import { SuccessButton } from '@/src/components/SuccessButton'
import { formatDate } from '@/src/lib/format'
import { ShareBar } from './ScanReview'
import type { ScanBillState } from './useScanBillController'

/** Twin of Mobile's ScanConfirm: where the share came from on the left, the total and the log button on the right. */
export function ScanConfirm(s: ScanBillState) {
  const { formatMoney, currencySymbol } = useCurrency()

  const { saving, success } = s.confirmButton

  return (
    <div className="scan-review">
      <div className="scan-col">
        <section className="scan-card scan-confirm-hero">
          <div className="scan-micro">Logging to {s.categoryLabel}</div>
          <div className="scan-hero-amount is-large">{formatMoney(s.myShare)}</div>
          <div className="scan-meta">
            {formatDate(s.date)} · from a scanned bill of {formatMoney(s.billTotal)}
          </div>
        </section>

        <div className="scan-micro">Where it came from</div>
        <ul className="scan-card scan-buckets" aria-label="Where your share came from">
          {s.buckets.map((b, i) => (
            <motion.li key={b.divisor} className="scan-bucket" {...popIn(staggerDelay(i, STAGGER.mount + STAGGER.block))}>
              <span className={`scan-badge ${b.divisor === 1 ? '' : 'is-accent'}`}>{b.divisor === 1 ? '1' : `÷${b.divisor}`}</span>
              <div className="scan-bucket-body">
                <strong>{b.divisor === 1 ? 'Fully mine' : `Split ${b.divisor} ways`}</strong>
                <span className="scan-meta">
                  {b.count} {b.count === 1 ? 'item' : 'items'} · {b.divisor === 1 ? '100% yours' : `you pay 1/${b.divisor}`}
                </span>
                <ShareBar
                  pct={Math.max(3, Math.round((b.share / Math.max(1, s.myShare)) * 100))}
                  height={4}
                  muted={b.divisor === 1}
                />
              </div>
              <div className="scan-bucket-amount">
                <strong>{formatMoney(b.share)}</strong>
                <span className="scan-meta">of {formatMoney(b.gross)}</span>
              </div>
            </motion.li>
          ))}
          {s.hasFee && (
            <motion.li className="scan-bucket" {...popIn(staggerDelay(s.buckets.length, STAGGER.mount + STAGGER.block))}>
              <span className="scan-badge is-accent">{currencySymbol}</span>
              <div className="scan-bucket-body">
                <strong>Fees &amp; discount, reconciled</strong>
                <span className="scan-meta">
                  {formatMoney(s.feeAggregate)} split equally across {s.peopleCount} people
                </span>
              </div>
              <div className="scan-bucket-amount">
                <strong>{formatMoney(s.feeShare)}</strong>
              </div>
            </motion.li>
          )}
        </ul>
      </div>

      <aside className="scan-col scan-side">
        <section className="scan-card">
          <div className="scan-spread">
            <span className="scan-meta is-strong">Total bill</span>
            <strong>{formatMoney(s.billTotal)}</strong>
          </div>
          <ShareBar pct={s.sharePct} height={8} />
          <div className="scan-spread scan-meta">
            <span className="scan-ink is-strong">
              You {formatMoney(s.myShare)} · {s.sharePct}%
            </span>
            <span className="is-strong">Others {formatMoney(s.billTotal - s.myShare)}</span>
          </div>
        </section>

        {s.confirmError && <p className="erd-log-error">{s.confirmError}</p>}

        <SuccessButton
          type="button"
          baseClass="erd-log-submit"
          className="scan-submit"
          saving={saving}
          success={success}
          successLabel="Expense saved"
          disabled={saving || success}
          onClick={s.handleConfirm}
        >
          Log {formatMoney(s.myShare)} to {s.categoryLabel}
        </SuccessButton>
        <button type="button" className="scan-link-btn" disabled={saving || success} onClick={() => s.setPhase('review')}>
          Back to items
        </button>
      </aside>
    </div>
  )
}
