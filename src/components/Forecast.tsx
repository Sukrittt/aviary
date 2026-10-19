'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useForecast } from '@/src/hooks/useForecast'
import { forecastHeadline, nextMonthLine } from '@/src/lib/forecastCopy'
import { splitEmoji } from '@/src/lib/emoji'
import { formatDateShort } from '@/src/lib/format'
import { BirdEmptyState } from '@/src/components/BirdEmptyState'
import { CaretRightIcon, ChartLineIcon } from '@/src/components/icons'
import type { ForecastEnvelope } from '@/lib/forecast'

/** Home's one line: "About ₹2,400 left at month end". Opens the forecast on Insights. */
export function ForecastLine({ hideAmounts }: { hideAmounts: boolean }) {
  const { formatCurrency } = useCurrency()
  const { data } = useForecast()
  const line = data && forecastHeadline(data, (n) => formatCurrency(n, hideAmounts))
  if (!line) return null
  return (
    <Link href="/insights#forecast" className="erd-card erd-home-rta-slim">
      <span>
        <span className="erd-rta-icon" aria-hidden="true"><ChartLineIcon size={18} /></span>
        {line}
      </span>
      <CaretRightIcon size={16} aria-hidden="true" />
    </Link>
  )
}

function rowMeta(e: ForecastEnvelope, money: (n: number) => string): string {
  if (e.overspent) return 'Already over'
  if (e.runsOutOn) return `Runs out around ${formatDateShort(e.runsOutOn)}`
  if (e.scheduled > 0) return `${money(e.scheduled)} in bills still to come`
  if (e.usualDaily > 0) return `Usually ${money(e.usualDaily)} a day`
  return 'Nothing expected'
}

/** Run-outs first by date, then the tightest envelopes. */
const byUrgency = (a: ForecastEnvelope, b: ForecastEnvelope) =>
  (a.runsOutOn ?? '9999').localeCompare(b.runsOutOn ?? '9999') || a.projected - b.projected

/** Insights' forecast: each envelope's month-end amount, then next month's spoken-for line. */
export function ForecastCard({ hideAmounts, icon }: { hideAmounts: boolean; icon: (category: string) => ReactNode }) {
  const { formatCurrency } = useCurrency()
  const { data } = useForecast()
  if (!data) return null
  const money = (n: number) => formatCurrency(n, hideAmounts)
  const next = nextMonthLine(data.nextMonth, money)
  const rows = data.envelopes.filter((e) => e.available !== 0 || e.projected !== 0).sort(byUrgency)

  return (
    <article id="forecast" className="erd-card ins-card ins-top-card">
      <div className="ins-card-heading">
        <div>
          <h2>Month-end forecast</h2>
          {data.basis && (
            <p>{data.basis === 'history' ? 'From your usual spending' : 'From your spending this month'}</p>
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
          {rows.map((e) => (
            <div key={e.category} className="ins-top-row">
              {icon(e.category)}
              <span className="ins-top-body">
                <span className="ins-top-item">{splitEmoji(e.category).text}</span>
                <span className="ins-top-meta">{rowMeta(e, money)}</span>
              </span>
              <span className="ins-top-amount">{money(e.projected)}</span>
            </div>
          ))}
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
