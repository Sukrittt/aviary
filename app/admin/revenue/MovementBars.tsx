import type { Movement } from '@/lib/billing/revenue'
import { inr, inrShort } from '../format'

type Kind = 'new' | 'reactivation' | 'expansion' | 'contraction' | 'churn'

export const KINDS: Record<Kind, { label: string; tone: string; sign: 1 | -1 }> = {
  new: { label: 'New', tone: 't-paid', sign: 1 },
  reactivation: { label: 'Reactivated', tone: 't-trial', sign: 1 },
  expansion: { label: 'Expansion', tone: 't-gift', sign: 1 },
  contraction: { label: 'Contraction', tone: 't-warn', sign: -1 },
  churn: { label: 'Churned', tone: 't-expired', sign: -1 },
}
const UP: Kind[] = ['new', 'reactivation', 'expansion']
const DOWN: Kind[] = ['contraction', 'churn']

export type MonthMovement = { month: Date } & Movement

export const monthLabel = (month: Date, year = false) =>
  month.toLocaleDateString('en-IN', { month: 'short', ...(year && { year: 'numeric' }), timeZone: 'Asia/Kolkata' })

export const netOf = (m: Movement) => m.new.mrr + m.reactivation.mrr + m.expansion.mrr - m.contraction.mrr - m.churn.mrr

/**
 * MRR gained above the line and lost below it, one column per month. Both
 * halves share one scale so a month's bars compare honestly with each other.
 */
export function MovementBars({ months }: { months: MonthMovement[] }) {
  const max = Math.max(1, ...months.flatMap((m) => [UP.reduce((s, k) => s + m[k].mrr, 0), DOWN.reduce((s, k) => s + m[k].mrr, 0)]))
  const used = (Object.keys(KINDS) as Kind[]).filter((k) => months.some((m) => m[k].n > 0))

  if (used.length === 0) {
    return <p className="adm-empty">No MRR has moved yet. It shows here from the first payment.</p>
  }

  return (
    <div>
      <div className="adm-move" role="img" aria-label="MRR gained and lost per month">
        <div className="adm-move-axis" aria-hidden>
          <span>+{inrShort(max)}</span>
          <span>0</span>
          <span>−{inrShort(max)}</span>
        </div>
        <div className="adm-move-cols">
          {months.map((m) => {
            const net = netOf(m)
            const title = [
              `${monthLabel(m.month, true)}: net ${net < 0 ? '−' : '+'}${inr(Math.abs(net))}`,
              ...(Object.keys(KINDS) as Kind[]).filter((k) => m[k].n > 0).map((k) => `${KINDS[k].label}: ${m[k].n} · ${inr(m[k].mrr)}`),
            ].join('\n')
            return (
              <div key={m.month.toISOString()} className="adm-move-col" title={title}>
                <div className="adm-move-up">
                  {UP.filter((k) => m[k].mrr > 0).map((k) => (
                    <i key={k} className={`adm-tone ${KINDS[k].tone}`} style={{ height: `${(m[k].mrr / max) * 100}%` }} />
                  ))}
                </div>
                <div className="adm-move-down">
                  {DOWN.filter((k) => m[k].mrr > 0).map((k) => (
                    <i key={k} className={`adm-tone ${KINDS[k].tone}`} style={{ height: `${(m[k].mrr / max) * 100}%` }} />
                  ))}
                </div>
                <span className="adm-move-label">{monthLabel(m.month)}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="adm-legend">
        {used.map((k) => (
          <span key={k} className={`adm-tone ${KINDS[k].tone}`}>
            <i aria-hidden />
            {KINDS[k].label}
          </span>
        ))}
      </div>
    </div>
  )
}
