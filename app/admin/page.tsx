import { pageMetadata } from '@/lib/seo'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import { COLLECTIONS } from '@/lib/models'
import { GRACE_DAYS } from '@/lib/archive'
import type { UserDoc } from '@/lib/users'
import { AI_USAGE, type AiUsageDoc } from '@/lib/ai/usage'
import { DailyBars } from './DailyBars'
import { RangeTabs } from './RangeTabs'
import { daysAgo, fmtBytes, num, parseRange, usd } from './format'

const TZ = 'Asia/Kolkata'

type DayCount = { _id: string; n: number }
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '0%')
const toMap = (rows: DayCount[]) => new Map(rows.map((r) => [r._id, r.n]))

function Kpi({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="adm-kpi">
      <div className="adm-kpi-label">{label}</div>
      <div className="adm-kpi-value">{typeof value === 'number' ? num(value) : value}</div>
      {note && <div className="adm-kpi-note">{note}</div>}
    </div>
  )
}

/** Per-collection doc count and storage size. `$collStats` isn't allowed on every Atlas tier, so size is best-effort. */
async function collectionStats(db: Awaited<ReturnType<typeof getDb>>) {
  const names = ['users', ...Object.values(COLLECTIONS)]
  return Promise.all(
    names.map(async (name) => {
      const coll = db.collection(name)
      const count = await coll.estimatedDocumentCount()
      let size: number | null = null
      try {
        const [stats] = await coll.aggregate<{ storageStats: { size: number } }>([{ $collStats: { storageStats: {} } }]).toArray()
        size = stats?.storageStats.size ?? null
      } catch {
        // not permitted on this cluster tier
      }
      return { name, count, size }
    }),
  )
}

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ signups?: string; tx?: string }> }) {
  const params = await searchParams
  const signupDays = parseRange(params.signups)
  const txDays = parseRange(params.tx)
  const db = await getDb()
  const users = db.collection<UserDoc>('users')
  const live = { deleted_at: null }

  const [total, new7, new30, active1, active7, active30, pendingDelete, signups, expensesPerDay, collections, [ai]] = await Promise.all([
    users.countDocuments(live),
    users.countDocuments({ ...live, createdAt: { $gte: daysAgo(7) } }),
    users.countDocuments({ ...live, createdAt: { $gte: daysAgo(30) } }),
    users.countDocuments({ ...live, lastSeenAt: { $gte: daysAgo(1) } }),
    users.countDocuments({ ...live, lastSeenAt: { $gte: daysAgo(7) } }),
    users.countDocuments({ ...live, lastSeenAt: { $gte: daysAgo(30) } }),
    users.countDocuments({ deleted_at: { $ne: null } }),
    users
      .aggregate<DayCount>([
        { $match: { createdAt: { $gte: daysAgo(signupDays) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, n: { $sum: 1 } } },
      ])
      .toArray(),
    // Creation time from the ObjectId, not `date` — `date` is when the spend happened, which can be backdated.
    db
      .collection(COLLECTIONS.expenses)
      .aggregate<DayCount>([
        { $match: { _id: { $gte: objectIdAt(daysAgo(txDays)) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$_id' }, timezone: TZ } }, n: { $sum: 1 } } },
      ])
      .toArray(),
    collectionStats(db),
    db
      .collection<AiUsageDoc>(AI_USAGE)
      .aggregate<{ calls: number; cost: number }>([
        { $match: { at: { $gte: daysAgo(30) } } },
        { $group: { _id: null, calls: { $sum: 1 }, cost: { $sum: { $ifNull: ['$costUsd', 0] } } } },
      ])
      .toArray(),
  ])

  return (
    <>
      <div className="adm-head">
        <h1>Overview</h1>
        <span className="adm-sub">Live from MongoDB</span>
      </div>

      <h2 className="adm-section">Users</h2>
      <div className="adm-grid">
        <Kpi label="Total accounts" value={total} note="Excludes accounts pending deletion" />
        <Kpi label="New this week" value={new7} note={`${num(new30)} new in the last 30 days`} />
        <Kpi label="Pending deletion" value={pendingDelete} note={`Purged ${GRACE_DAYS} days after the request`} />
      </div>

      <h2 className="adm-section">Activity</h2>
      <div className="adm-grid">
        <Kpi label="Active today" value={active1} note={`Used the app in the last 24 hours · ${pct(active1, total)} of accounts`} />
        <Kpi label="Active this week" value={active7} note={`Last 7 days · ${pct(active7, total)} of accounts`} />
        <Kpi label="Active this month" value={active30} note={`Last 30 days · ${pct(active30, total)} of accounts`} />
        <Kpi label="AI spend, 30 days" value={usd(ai?.cost ?? 0)} note={`${num(ai?.calls ?? 0)} Gemini calls`} />
      </div>
      <p className="adm-sub">Activity is recorded from the first signed-in request after this dashboard shipped, so older users show as inactive until they open the app again.</p>

      <div className="adm-two">
        <section className="erd-card">
          <div className="adm-chart-head">
            <h2>New signups</h2>
            <RangeTabs param="signups" value={signupDays} params={params} />
          </div>
          <DailyBars counts={toMap(signups)} days={signupDays} unit="signups" />
        </section>
        <section className="erd-card">
          <div className="adm-chart-head">
            <h2>Transactions added</h2>
            <RangeTabs param="tx" value={txDays} params={params} />
          </div>
          <DailyBars counts={toMap(expensesPerDay)} days={txDays} unit="transactions" />
        </section>
      </div>

      <section className="erd-card">
        <h2>Collections</h2>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Collection</th>
                <th className="num">Documents</th>
                <th className="num">Size</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c) => (
                <tr key={c.name}>
                  <td className="adm-mono">{c.name}</td>
                  <td className="num">{num(c.count)}</td>
                  <td className="num">{c.size === null ? '—' : fmtBytes(c.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function objectIdAt(date: Date) {
  return ObjectId.createFromTime(Math.floor(date.getTime() / 1000))
}

export const metadata = pageMetadata('/admin')
