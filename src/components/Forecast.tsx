'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useForecast } from '@/src/hooks/useForecast'
import { runOutWarning, nextMonthLine } from '@/src/lib/forecastCopy'
import { usePersistentState } from '@/src/hooks/usePersistentState'
import { splitEmoji } from '@/src/lib/emoji'
import { formatDateShort } from '@/src/lib/format'
import { BirdEmptyState } from '@/src/components/BirdEmptyState'
import { ForecastSkeleton } from '@/src/components/TabSkeleton'
import { ChartLineIcon } from '@/src/components/icons'
import type { ForecastEnvelope } from '@/lib/forecast'

const parseDismissed = (raw: string) => raw === '1'
const serializeDismissed = (value: boolean) => (value ? '1' : '0')

/**
 * Home's heads-up: "Fun runs out around 24 Oct". Only shows when an envelope
 * runs dry before month end, and stays gone once dismissed until the forecast
 * names a different envelope or date. The full forecast lives on Insights.
 */
export function ForecastLine() {
  const { data } = useForecast()
  const warning = data ? runOutWarning(data) : null
  const [dismissed, setDismissed] = usePersistentState(
    `rollover-dismissed-${warning?.key ?? 'forecast-none'}`, false, parseDismissed, serializeDismissed,
  )
  const reduceMotion = useReducedMotion()
  const fold = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const }
  return (
    <AnimatePresence initial={false}>
      {warning && !dismissed && (
        // Same exit as Home's rollover strip: slides off to the right, then its
        // height (and the column's 20px gap) closes so the cards below glide up.
        <motion.div
          key={warning.key}
          style={{ flexShrink: 0, overflow: 'hidden' }}
          exit={reduceMotion ? { opacity: 0 } : {
            x: '100%', opacity: 0, height: 0, marginBottom: -20,
            transition: {
              x: { duration: 0.3, ease: [0.4, 0, 1, 1] },
              opacity: { duration: 0.3 },
              height: { delay: 0.22, ...fold },
              marginBottom: { delay: 0.22, ...fold },
            },
          }}
        >
          <div className="erd-card erd-home-rta-slim home-forecast-warning">
            <Link href="/insights#forecast">
              <span className="erd-rta-icon" aria-hidden="true"><ChartLineIcon size={18} /></span>
              {warning.text}
            </Link>
            <button type="button" onClick={() => setDismissed(true)}>Okay</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function rowMeta(e: ForecastEnvelope, money: (n: number) => string): string {
  // Framed as what's still fine, with the fix one tap away on the right.
  if (e.overspent) return 'Spent past the plan'
  if (e.runsOutOn) return `Covered till ${formatDateShort(e.runsOutOn)}`
  if (e.scheduled > 0) return `${money(e.scheduled)} in bills still to come`
  if (e.usualDaily > 0) return `Usually ${money(e.usualDaily)} a day`
  return 'Nothing expected'
}

/** Run-outs first by date, then the tightest envelopes. */
const byUrgency = (a: ForecastEnvelope, b: ForecastEnvelope) =>
  (a.runsOutOn ?? '9999').localeCompare(b.runsOutOn ?? '9999') || a.projected - b.projected

/** Rows shown before "Show all": run-outs sort first, so these are the ones to act on. */
const PREVIEW_ROWS = 4

/** Insights' forecast: each envelope's month-end amount, then next month's spoken-for line. */
export function ForecastCard({ hideAmounts, icon, onTopUp }: {
  hideAmounts: boolean
  icon: (category: string) => ReactNode
  /** Opens Move money into `category`, prefilled with the shortfall. */
  onTopUp: (category: string, amount: number) => void
}) {
  const { formatCurrency } = useCurrency()
  const { data, isPending } = useForecast()
  const [expanded, setExpanded] = useState(false)
  if (!data) return isPending ? <ForecastSkeleton /> : null
  // Estimates, so whole rupees: paisa would read as false precision.
  const money = (n: number) => formatCurrency(Math.round(n), hideAmounts)
  const next = nextMonthLine(data.nextMonth, money)
  const rows = data.envelopes.filter((e) => e.available !== 0 || e.projected !== 0).sort(byUrgency)
  const shortCount = rows.filter((e) => e.projected < 0).length
  const shown = expanded ? rows : rows.slice(0, PREVIEW_ROWS)

  return (
    <article id="forecast" className="erd-card ins-card ins-top-card">
      <div className="ins-card-heading">
        <div>
          <h2>Month-end forecast</h2>
          {data.basis && (
            <p>{data.basis === 'history' ? 'From your usual spending' : 'From your spending this month'}</p>
          )}
          {/* totalLeft nets the shortfalls against everything else, so non-negative means the gaps are coverable. */}
          {shortCount > 0 && data.totalLeft !== null && data.totalLeft >= 0 && (
            <p className="ins-forecast-cover">
              {`There's enough elsewhere to cover ${shortCount === 1 ? 'the gap' : `all ${shortCount} gaps`}.`}
            </p>
          )}
        </div>
        {data.totalLeft !== null && <span className="ins-top-amount">{money(data.totalLeft)}</span>}
      </div>
      {!data.basis ? (
        <BirdEmptyState
          compact
          subject="expenses"
          title="Your forecast's warming up"
          description="It shows up after a week of spending. Keep logging and it'll be here."
        />
      ) : (
        <div className="ins-top-list">
          {shown.map((e) => (
            <div key={e.category} className="ins-top-row">
              {icon(e.category)}
              <span className="ins-top-body">
                <span className="ins-top-item">{splitEmoji(e.category).text}</span>
                <span className={`ins-top-meta${e.overspent || e.runsOutOn ? ' ins-forecast-short' : ''}`}>{rowMeta(e, money)}</span>
              </span>
              {e.projected < 0 ? (
                <button
                  type="button"
                  className="ins-forecast-topup"
                  aria-label={`Top up ${splitEmoji(e.category).text}`}
                  onClick={() => onTopUp(e.category, Math.round(-e.projected))}
                >
                  Top up {money(-e.projected)}
                </button>
              ) : (
                <span className="ins-top-amount">{money(e.projected)}</span>
              )}
            </div>
          ))}
          {rows.length > PREVIEW_ROWS && (
            <button type="button" className="ins-forecast-more" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
        </div>
      )}
      {next && (
        <p className="ins-forecast-next">
          <strong>{next.title}</strong>
          {next.detail && <span>{next.detail}</span>}
        </p>
      )}
    </article>
  )
}
