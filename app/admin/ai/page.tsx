import { pageMetadata } from '@/lib/seo'
import Link from 'next/link'
import { getDb } from '@/lib/mongodb'
import { AI_USAGE, type AiUsageDoc } from '@/lib/ai/usage'
import type { UserDoc } from '@/lib/users'
import { DailyBars } from '../DailyBars'
import { RangeTabs } from '../RangeTabs'
import { daysAgo, fmtDateTime, num, parseRange, usd } from '../format'

interface Totals {
  _id: string | null
  calls: number
  errors: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  avgMs: number
}

const totalsGroup = (id: unknown) => ({
  $group: {
    _id: id,
    calls: { $sum: 1 },
    errors: { $sum: { $cond: ['$ok', 0, 1] } },
    inputTokens: { $sum: '$inputTokens' },
    outputTokens: { $sum: { $add: ['$outputTokens', '$thinkingTokens'] } },
    costUsd: { $sum: { $ifNull: ['$costUsd', 0] } },
    avgMs: { $avg: '$durationMs' },
  },
})

export default async function AdminAi({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const params = await searchParams
  const DAYS = parseRange(params.range)
  const db = await getDb()
  const coll = db.collection<AiUsageDoc>(AI_USAGE)
  const match = { $match: { at: { $gte: daysAgo(DAYS) } } }

  const [[overall], byFeature, byUser, perDay, errors] = await Promise.all([
    coll.aggregate<Totals>([match, totalsGroup(null)]).toArray(),
    coll.aggregate<Totals>([match, totalsGroup('$feature'), { $sort: { calls: -1 } }]).toArray(),
    coll.aggregate<Totals>([match, totalsGroup('$user_id'), { $sort: { costUsd: -1, calls: -1 } }, { $limit: 15 }]).toArray(),
    coll
      .aggregate<{ _id: string; n: number }>([match, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: 'Asia/Kolkata' } }, n: { $sum: 1 } } }])
      .toArray(),
    coll.find({ ok: false }).sort({ at: -1 }).limit(20).toArray(),
  ])

  const emails = new Map(
    (
      await db
        .collection<UserDoc>('users')
        .find({ _id: { $in: [...new Set([...byUser.map((u) => u._id), ...errors.map((e) => e.user_id)])].filter((id): id is string => !!id) } }, { projection: { email: 1 } })
        .toArray()
    ).map((u) => [u._id, u.email]),
  )

  const totals = overall ?? { calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, avgMs: 0 }

  const table = (rows: Totals[], label: string, cell: (id: string | null) => React.ReactNode) => (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>{label}</th>
            <th className="num">Calls</th>
            <th className="num">Errors</th>
            <th className="num">Avg time</th>
            <th className="num">Tokens in / out</th>
            <th className="num">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r._id)}>
              <td>{cell(r._id)}</td>
              <td className="num">{num(r.calls)}</td>
              <td className="num">{r.errors ? num(r.errors) : '—'}</td>
              <td className="num">{(r.avgMs / 1000).toFixed(1)}s</td>
              <td className="num">
                {num(r.inputTokens)} / {num(r.outputTokens)}
              </td>
              <td className="num">{usd(r.costUsd)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="adm-muted">
                No calls in the last {DAYS} days.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <div className="adm-head">
        <h1>AI usage</h1>
        <RangeTabs param="range" value={DAYS} params={params} />
      </div>
      <p className="adm-sub">Last {DAYS} days · cost estimated from token counts (lib/ai/pricing.ts)</p>

      <div className="adm-grid">
        {[
          ['Calls', num(totals.calls)],
          ['Estimated cost', usd(totals.costUsd)],
          ['Error rate', totals.calls ? `${((totals.errors / totals.calls) * 100).toFixed(1)}%` : '—'],
          ['Avg response', `${(totals.avgMs / 1000).toFixed(1)}s`],
          ['Tokens in', num(totals.inputTokens)],
          ['Tokens out', num(totals.outputTokens)],
        ].map(([label, value]) => (
          <div key={label} className="adm-kpi">
            <div className="adm-kpi-label">{label}</div>
            <div className="adm-kpi-value">{value}</div>
          </div>
        ))}
      </div>

      <section className="erd-card">
        <h2>Calls</h2>
        <DailyBars counts={new Map(perDay.map((d) => [d._id, d.n]))} days={DAYS} unit="calls" />
      </section>

      <section className="erd-card">
        <h2>By feature</h2>
        {table(byFeature, 'Feature', (id) => id)}
      </section>

      <section className="erd-card">
        <h2>Top users</h2>
        {table(byUser, 'User', (id) => (id ? <Link href={`/admin/users/${encodeURIComponent(id)}`}>{emails.get(id) ?? id}</Link> : '—'))}
      </section>

      <section className="erd-card">
        <h2>Recent errors</h2>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <tbody>
              {errors.map((e) => (
                <tr key={String(e._id)}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.at)}</td>
                  <td>{e.feature}</td>
                  <td>{emails.get(e.user_id) ?? e.user_id}</td>
                  <td className="adm-mono adm-muted">{e.error}</td>
                </tr>
              ))}
              {errors.length === 0 && (
                <tr>
                  <td className="adm-muted">No failed calls recorded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

export const metadata = pageMetadata('/admin/ai')
