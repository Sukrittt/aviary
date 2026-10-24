import Link from 'next/link'
import { getDb } from '@/lib/mongodb'
import { REFERRAL_CODES, REFERRALS, type ReferralCodeDoc, type ReferralDoc } from '@/lib/referrals'
import type { UserDoc } from '@/lib/users'
import { ActionForm, SubmitButton } from '../ActionForm'
import { fmtDate, num, timeAgo } from '../format'
import { createCodeAction, toggleCodeAction } from './actions'

export const dynamic = 'force-dynamic'

type Funnel = { _id: string; applied: number; activated: number; rewarded: number; blocked: number; last: Date }

const STATUS_TONE: Record<ReferralDoc['status'], string> = { activated: 'is-good', pending: '', blocked: 'is-bad', expired: 'is-warn' }

export default async function AdminReferrals() {
  const db = await getDb()
  const [funnels, creators, recent] = await Promise.all([
    db.collection<ReferralDoc>(REFERRALS).aggregate<Funnel>([
      { $group: {
        _id: '$code',
        applied: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 0, 1] } },
        activated: { $sum: { $cond: [{ $eq: ['$status', 'activated'] }, 1, 0] } },
        rewarded: { $sum: { $cond: [{ $ifNull: ['$referee', false] }, 1, 0] } },
        blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } },
        last: { $max: '$appliedAt' },
      } },
      { $sort: { applied: -1 } },
      { $limit: 100 },
    ]).toArray(),
    db.collection<ReferralCodeDoc>(REFERRAL_CODES).find({ kind: 'creator' }).sort({ createdAt: -1 }).toArray(),
    db.collection<ReferralDoc>(REFERRALS).find().sort({ appliedAt: -1 }).limit(50).toArray(),
  ])
  const byCode = new Map(funnels.map((f) => [f._id, f]))
  const topUserCodes = funnels.filter((f) => !creators.some((c) => c._id === f._id)).slice(0, 25)
  const owners = await db.collection<ReferralCodeDoc>(REFERRAL_CODES).find({ _id: { $in: topUserCodes.map((f) => f._id) } }, { projection: { ownerId: 1 } }).toArray()
  const ownerOf = new Map(owners.map((o) => [o._id, o.ownerId]))
  const ids = [...new Set([...recent.flatMap((r) => [r._id, r.referrerId]), ...owners.map((o) => o.ownerId)])].filter((x): x is string => !!x)
  const emails = new Map((await db.collection<UserDoc>('users').find({ _id: { $in: ids } }, { projection: { email: 1 } }).toArray()).map((u) => [u._id, u.email]))
  const total = funnels.reduce((t, f) => ({ applied: t.applied + f.applied, activated: t.activated + f.activated }), { applied: 0, activated: 0 })

  const userLink = (id: string | null) => (id ? <Link href={`/admin/users/${encodeURIComponent(id)}`}>{emails.get(id) ?? id}</Link> : <span className="adm-muted">—</span>)

  return (
    <>
      <div className="adm-head">
        <h1>Referrals</h1>
        <span className="adm-sub">{num(total.applied)} referred · {num(total.activated)} activated</span>
      </div>

      <section className="erd-card">
        <h2>Creator codes</h2>
        <ActionForm action={createCodeAction}>
          <input className="adm-input" name="code" placeholder="Code, e.g. PRIYA" required style={{ width: 140, textTransform: 'uppercase' }} />
          <input className="adm-input" name="label" placeholder="Who it's for" required />
          <label className="adm-muted">New user months <input className="adm-input" name="refereeMonths" type="number" min={1} max={12} defaultValue={1} style={{ width: 64 }} /></label>
          <label className="adm-muted">Creator months <input className="adm-input" name="referrerMonths" type="number" min={0} max={12} defaultValue={0} style={{ width: 64 }} /></label>
          <input className="adm-input" name="offer" placeholder="Landing line (optional)" maxLength={120} style={{ minWidth: 280 }} />
          <SubmitButton variant="primary">Create code</SubmitButton>
        </ActionForm>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr><th>Code</th><th>For</th><th>Reward</th><th className="num">Signed up</th><th className="num">Activated</th><th className="num">Blocked</th><th>Last used</th><th /></tr>
            </thead>
            <tbody>
              {creators.map((c) => {
                const f = byCode.get(c._id)
                return (
                  <tr key={c._id}>
                    <td><strong>{c._id}</strong> {!c.active && <span className="adm-badge is-warn">Paused</span>}</td>
                    <td>{c.label}<div className="adm-muted">{c.offer ?? 'Default landing'}</div></td>
                    <td>{c.refereeMonths} mo new user · {c.referrerMonths} mo creator</td>
                    <td className="num">{num(f?.applied ?? 0)}</td>
                    <td className="num">{num(f?.activated ?? 0)}</td>
                    <td className="num">{num(f?.blocked ?? 0)}</td>
                    <td>{f ? timeAgo(f.last) : '—'}</td>
                    <td>
                      <ActionForm action={toggleCodeAction.bind(null, c._id)} className="">
                        <SubmitButton>{c.active ? 'Pause' : 'Resume'}</SubmitButton>
                      </ActionForm>
                    </td>
                  </tr>
                )
              })}
              {creators.length === 0 && <tr><td colSpan={8} className="adm-muted">No creator codes yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="erd-card">
        <h2>Top user codes</h2>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Code</th><th>Owner</th><th className="num">Signed up</th><th className="num">Activated</th><th className="num">Blocked</th><th>Last used</th></tr></thead>
            <tbody>
              {topUserCodes.map((f) => (
                <tr key={f._id}>
                  <td><strong>{f._id}</strong></td>
                  <td>{userLink(ownerOf.get(f._id) ?? null)}</td>
                  <td className="num">{num(f.applied)}</td>
                  <td className="num">{num(f.activated)}</td>
                  <td className="num">{num(f.blocked)}</td>
                  <td>{timeAgo(f.last)}</td>
                </tr>
              ))}
              {topUserCodes.length === 0 && <tr><td colSpan={6} className="adm-muted">Nobody has used a friend&apos;s code yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="erd-card">
        <h2>Recent referrals</h2>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>New user</th><th>Code</th><th>Referrer</th><th>Via</th><th>Status</th><th>Applied</th><th>Rewards</th></tr></thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r._id}>
                  <td>{userLink(r._id)}</td>
                  <td>{r.code}</td>
                  <td>{userLink(r.referrerId)}</td>
                  <td>{r.via}</td>
                  <td><span className={`adm-badge ${STATUS_TONE[r.status]}`}>{r.status}{r.reason ? ` · ${r.reason}` : ''}</span></td>
                  <td>{fmtDate(r.appliedAt)}</td>
                  <td className="adm-muted">{[r.referee && `them: ${r.referee.kind}`, r.referrer && `referrer: ${r.referrer.kind}`].filter(Boolean).join(' · ') || '—'}</td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td colSpan={7} className="adm-muted">No referrals yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
